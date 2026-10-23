from django.db import models
from django.utils import timezone


class Ingredient(models.Model):
    """Table de référence lue par l'outil explain_ingredient."""
    COMPATIBLE, AMBIGU, INTERDIT = 'compatible', 'ambigu', 'interdit'
    STATUSES = [(COMPATIBLE, 'Compatible'), (AMBIGU, 'Ambigu'), (INTERDIT, 'Interdit')]

    name = models.CharField(max_length=80, unique=True)
    # Autres écritures, séparées par des virgules, sans accents ni majuscules (« e471, mono et diglycerides »)
    aliases = models.TextField(blank=True, default='')
    status = models.CharField(max_length=10, choices=STATUSES)
    explanation = models.TextField()

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f'{self.name} ({self.status})'


class Exchange(models.Model):
    """Un échange avec l'assistant, sans donnée personnelle (ni IP, ni identifiant). Purgé à 90 jours."""
    ANSWERED, UNANSWERED, REFUSED, ERROR = 'answered', 'unanswered', 'refused', 'error'
    OUTCOMES = [(ANSWERED, 'Répondu'), (UNANSWERED, 'Sans réponse satisfaisante'),
                (REFUSED, 'Refus du modèle'), (ERROR, 'Erreur')]

    created_at = models.DateTimeField(default=timezone.now)
    day = models.DateField(default=timezone.localdate)
    portal = models.CharField(max_length=10)
    lang = models.CharField(max_length=2, blank=True, default='')
    question = models.CharField(max_length=500)
    context_code = models.CharField(max_length=64, blank=True, default='')
    tools = models.JSONField(default=list)            # [{"name": …, "input": …}, …]
    product_codes = models.JSONField(default=list)    # fiches lues ou trouvées
    answer = models.TextField(blank=True, default='')
    outcome = models.CharField(max_length=12, choices=OUTCOMES, default=ANSWERED)
    unanswered_reason = models.CharField(max_length=40, blank=True, default='')
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    cache_read_tokens = models.IntegerField(default=0)
    cache_write_tokens = models.IntegerField(default=0)
    cost_usd = models.FloatField(default=0)
    duration_ms = models.IntegerField(default=0)
    model = models.CharField(max_length=40, blank=True, default='')

    class Meta:
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['day'], name='exchange_day_idx'),
            models.Index(fields=['outcome', 'day'], name='exchange_outcome_day_idx'),
        ]
