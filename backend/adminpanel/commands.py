"""Commandes de gestion journalisées (imports, synchros, recalculs)."""
import time

from django.core.management.base import BaseCommand

from . import audit


class AuditedCommand(BaseCommand):
    """BaseCommand qui écrit une ligne d'audit à la fin (réussite ou échec).

    Lancée par Celery (synchro horaire), la ligne porte l'acteur « système ».
    """
    audit_action = 'admin.change'

    def audit_target(self, options):
        return options.get('portal') or ''

    def execute(self, *args, **options):
        started = time.monotonic()
        actor = 'système' if options.get('scheduled') else 'commande'
        params = {k: v for k, v in options.items()
                  if k in ('portal', 'mode', 'limit', 'hours', 'restart', 'url') and v not in (None, '', 0, False)}
        try:
            output = super().execute(*args, **options)
        except BaseException as error:
            audit.record(self.audit_action, target=self.audit_target(options), result='failure', actor=actor,
                         detail=f'{type(error).__name__}: {error} — {params}')
            raise
        audit.record(self.audit_action, target=self.audit_target(options), actor=actor,
                     detail=f'{params} — {time.monotonic() - started:.0f} s')
        return output

    def create_parser(self, prog_name, subcommand, **kwargs):
        parser = super().create_parser(prog_name, subcommand, **kwargs)
        parser.add_argument('--scheduled', action='store_true', help='lancement automatique (journalisé « système »)')
        return parser
