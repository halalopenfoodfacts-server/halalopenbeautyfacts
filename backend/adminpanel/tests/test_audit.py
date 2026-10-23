import csv
import datetime
import io

from django.contrib.admin.models import ADDITION, CHANGE, LogEntry
from django.contrib.auth.models import User
from django.contrib.contenttypes.models import ContentType
from django.core.management import CommandError, call_command
from django.db import DatabaseError, connection, transaction
from django.test import RequestFactory
from django.utils import timezone

from adminpanel import audit
from adminpanel.commands import AuditedCommand
from adminpanel.models import AuditLog
from products.models import Product, StatusReport

from .helpers import AdminTestCase


class DummyImport(AuditedCommand):
    audit_action = 'import.run'

    def add_arguments(self, parser):
        parser.add_argument('--portal', default='food')
        parser.add_argument('--fail', action='store_true')

    def handle(self, *args, **options):
        if options['fail']:
            raise CommandError('fichier introuvable')


class AppendOnlyTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.entry = AuditLog.objects.create(action='login.success')

    def test_model_refuses_update_and_delete(self):
        self.entry.target = 'falsifié'
        with self.assertRaises(PermissionError):
            self.entry.save()
        with self.assertRaises(PermissionError):
            self.entry.delete()

    def test_database_refuses_update_delete_truncate(self):
        for sql in ("UPDATE adminpanel_auditlog SET result = 'failure'",
                    'DELETE FROM adminpanel_auditlog',
                    'TRUNCATE adminpanel_auditlog'):
            with self.assertRaises(DatabaseError, msg=sql), transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute(sql)
        with self.assertRaises(DatabaseError), transaction.atomic():
            AuditLog.objects.all().update(action='x')
        with self.assertRaises(DatabaseError), transaction.atomic():
            AuditLog.objects.all().delete()
        self.assertEqual(AuditLog.objects.get().result, 'success')

    def test_insert_is_allowed(self):
        audit.record('config.update', target='x')
        self.assertEqual(AuditLog.objects.count(), 2)


class RecordTests(AdminTestCase):
    def test_ip_is_hashed_and_stable(self):
        request = RequestFactory().get('/', HTTP_X_REAL_IP='192.0.2.1')
        audit.record('logout', request=request)
        audit.record('logout', request=request)
        hashes = set(AuditLog.objects.values_list('ip_hash', flat=True))
        self.assertEqual(len(hashes), 1)
        value = hashes.pop()
        self.assertEqual(len(value), 16)
        self.assertNotIn('192.0.2.1', value)
        self.assertNotEqual(audit.hash_ip('192.0.2.1'), audit.hash_ip('192.0.2.2'))

    def test_long_values_are_truncated(self):
        audit.record('product.update', target='x' * 1000, detail='y' * 10000)
        entry = AuditLog.objects.get()
        self.assertEqual(len(entry.target), 255)
        self.assertEqual(len(entry.detail), 4000)


class SourceTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        self.user = User.objects.create(username='mustapha')
        self.product = Product.objects.create(portal='food', code='3017620422003', product_name='Nutella', data={})

    def log(self, obj, flag, message):
        return LogEntry.objects.log_action(
            user_id=self.user.pk, content_type_id=ContentType.objects.get_for_model(obj).pk,
            object_id=obj.pk, object_repr=str(obj), action_flag=flag, change_message=message)

    def test_django_admin_product_changes(self):
        self.log(self.product, CHANGE, [{'changed': {'fields': ['Product name']}}])
        self.log(self.product, CHANGE, [{'changed': {'fields': ['Is halal']}}])
        self.log(self.product, ADDITION, [{'added': {}}])
        actions = list(AuditLog.objects.order_by('id').values_list('action', flat=True))
        self.assertEqual(actions, ['product.update', 'halal_status.update', 'product.create'])
        entry = AuditLog.objects.order_by('id').first()
        self.assertEqual(entry.actor, 'admin-django:mustapha')
        self.assertIn('3017620422003', entry.target)

    def test_django_admin_report_and_config(self):
        from django_celery_beat.models import IntervalSchedule, PeriodicTask
        report = StatusReport.objects.create(portal='food', code='1', reason='other')
        task = PeriodicTask.objects.create(
            name='t', task='x', interval=IntervalSchedule.objects.create(every=1, period='hours'))
        self.log(report, CHANGE, [{'changed': {'fields': ['Handled']}}])
        self.log(task, CHANGE, [{'changed': {'fields': ['Enabled']}}])
        self.assertEqual(list(AuditLog.objects.order_by('id').values_list('action', flat=True)),
                         ['report.update', 'config.update'])

    def test_commands_are_logged_with_result(self):
        call_command(DummyImport(), portal='beauty', scheduled=True)
        with self.assertRaises(CommandError):
            call_command(DummyImport(), fail=True)
        ok, failed = AuditLog.objects.order_by('id')
        self.assertEqual((ok.action, ok.target, ok.result, ok.actor), ('import.run', 'beauty', 'success', 'système'))
        self.assertEqual((failed.result, failed.actor), ('failure', 'commande'))
        self.assertIn('fichier introuvable', failed.detail)

    def test_real_commands_are_audited(self):
        from products.management.commands import import_full, refresh_halal_status, sync_delta
        self.assertEqual(sync_delta.Command.audit_action, 'sync.run')
        self.assertEqual(import_full.Command.audit_action, 'import.run')
        self.assertEqual(refresh_halal_status.Command.audit_action, 'halal_status.refresh')


class AuditPageTests(AdminTestCase):
    def setUp(self):
        super().setUp()
        now = timezone.now()
        AuditLog.objects.create(action='product.delete', target='=HYPERLINK("x")', created_at=now - datetime.timedelta(days=10))
        AuditLog.objects.create(action='import.run', target='food', created_at=now - datetime.timedelta(days=1))
        self.login()   # ajoute login.success

    def test_list_and_filters(self):
        response = self.client.get('/gestion/journal')
        self.assertContains(response, '3 entrées')
        response = self.client.get('/gestion/journal?action=import.run')
        self.assertContains(response, '1 entrée')
        self.assertContains(response, 'Import de produits')
        start = (timezone.localdate() - datetime.timedelta(days=5)).isoformat()
        response = self.client.get(f'/gestion/journal?debut={start}')
        self.assertContains(response, '2 entrées')
        end = (timezone.localdate() - datetime.timedelta(days=5)).isoformat()
        self.assertContains(self.client.get(f'/gestion/journal?fin={end}'), '1 entrée')
        self.assertContains(self.client.get('/gestion/journal?resultat=failure'), '0 entrée')

    def test_invalid_filters_are_ignored(self):
        response = self.client.get('/gestion/journal?debut=pas-une-date&action=<script>&page=999')
        self.assertEqual(response.status_code, 200)
        self.assertContains(response, '3 entrées')

    def test_csv_export(self):
        response = self.client.get('/gestion/journal.csv?action=product.delete')
        self.assertEqual(response['Content-Type'], 'text/csv; charset=utf-8')
        self.assertIn('attachment', response['Content-Disposition'])
        rows = list(csv.reader(io.StringIO(b''.join(response.streaming_content).decode('utf-8-sig')), delimiter=';'))
        self.assertEqual(rows[0][:3], ['date', 'action', 'libellé'])
        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[1][1], 'product.delete')
        self.assertTrue(rows[1][4].startswith("'="), 'injection de formule neutralisée')
        export = AuditLog.objects.filter(action='audit.export').get()
        self.assertIn('product.delete', export.detail)
