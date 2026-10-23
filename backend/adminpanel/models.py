from django.db import models
from django.utils import timezone


class PageHit(models.Model):
    """Une page vue (mesure d'audience sans cookie). Purgée après ANALYTICS_RETENTION_DAYS.

    `visitor` est l'empreinte de l'IP et du navigateur salée avec un sel du jour gardé
    seulement dans Redis : deux journées ne peuvent pas être reliées entre elles.
    """
    day = models.DateField()
    portal = models.CharField(max_length=10)
    path = models.CharField(max_length=200)
    product_code = models.CharField(max_length=64, blank=True, default='')
    visitor = models.CharField(max_length=16)
    device = models.CharField(max_length=8)        # mobile, tablet, desktop
    country = models.CharField(max_length=2, blank=True, default='')

    class Meta:
        indexes = [
            models.Index(fields=['day', 'portal'], name='hit_day_portal_idx'),
        ]


class SearchTerm(models.Model):
    """Termes recherchés, comptés par jour (aucune donnée sur le visiteur)."""
    day = models.DateField()
    portal = models.CharField(max_length=10)
    term = models.CharField(max_length=100)
    count = models.PositiveIntegerField(default=0)

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=['day', 'portal', 'term'], name='search_term_day_unique'),
        ]


class SystemSample(models.Model):
    """Relevé des ressources du serveur, toutes les 5 minutes (tâche Celery)."""
    created_at = models.DateTimeField(default=timezone.now, db_index=True)
    cpu_percent = models.FloatField(null=True)
    load1 = models.FloatField(null=True)
    mem_percent = models.FloatField(null=True)
    mem_used_mb = models.IntegerField(null=True)
    mem_total_mb = models.IntegerField(null=True)
    disk_percent = models.FloatField(null=True)
    disk_used_gb = models.FloatField(null=True)
    disk_total_gb = models.FloatField(null=True)
    db_size_mb = models.IntegerField(null=True)
    # Requêtes servies par nginx depuis le relevé précédent (journaux d'accès)
    requests = models.IntegerField(default=0)
    avg_response_ms = models.FloatField(null=True)
    api_avg_response_ms = models.FloatField(null=True)
    p95_response_ms = models.FloatField(null=True)
    errors_4xx = models.IntegerField(default=0)
    errors_5xx = models.IntegerField(default=0)


class AuditLog(models.Model):
    """Journal d'audit en ajout seul.

    Le modèle refuse les modifications et suppressions ; un trigger PostgreSQL
    (migration 0001) fait de même pour toute requête SQL, y compris hors de Django.
    """
    SUCCESS, FAILURE, BLOCKED = 'success', 'failure', 'blocked'
    RESULTS = [(SUCCESS, 'Réussi'), (FAILURE, 'Échec'), (BLOCKED, 'Bloqué')]

    created_at = models.DateTimeField(default=timezone.now)
    action = models.CharField(max_length=40)
    actor = models.CharField(max_length=80, blank=True, default='')
    target = models.CharField(max_length=255, blank=True, default='')
    result = models.CharField(max_length=10, choices=RESULTS, default=SUCCESS)
    ip_hash = models.CharField(max_length=16, blank=True, default='')
    detail = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at', '-id']
        indexes = [
            models.Index(fields=['created_at'], name='audit_created_idx'),
            models.Index(fields=['action', 'created_at'], name='audit_action_created_idx'),
        ]

    def save(self, *args, **kwargs):
        if self.pk is not None:
            raise PermissionError("Journal d'audit en ajout seul : modification refusée")
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        raise PermissionError("Journal d'audit en ajout seul : suppression refusée")
