"""
Journal d'audit : `record()` ajoute une ligne, jamais d'erreur remontée à l'appelant.

L'IP est hachée avec une clé dérivée de SECRET_KEY : la même adresse donne toujours la
même empreinte (on reconnaît un attaquant qui revient) sans pouvoir retrouver l'adresse.
"""
import contextvars
import logging

from django.utils.crypto import salted_hmac

logger = logging.getLogger(__name__)

# Requête en cours, posée par AuditContextMiddleware : les signaux (admin Django) n'y ont pas accès.
current_request = contextvars.ContextVar('audit_request', default=None)

ACTIONS = {
    'login.success': 'Connexion réussie',
    'login.failure': 'Code erroné',
    'login.blocked': 'Connexion bloquée (trop d\'essais)',
    'logout': 'Déconnexion',
    'session.expired': 'Session expirée',
    'audit.export': 'Export CSV du journal',
    'product.create': 'Produit créé',
    'product.update': 'Produit modifié',
    'product.delete': 'Produit supprimé',
    'halal_status.update': 'Statut halal modifié',
    'halal_status.refresh': 'Recalcul des statuts halal',
    'report.update': 'Signalement traité',
    'report.delete': 'Signalement supprimé',
    'import.run': 'Import de produits',
    'sync.run': 'Synchronisation Open Food Facts',
    'images.update': 'Mise à jour des images',
    'config.update': 'Configuration modifiée',
    'admin.change': 'Autre modification (admin Django)',
}


def client_ip(request):
    """IP du visiteur : nginx pose X-Real-IP (Django n'écoute que sur 127.0.0.1)."""
    return request.headers.get('X-Real-IP') or request.META.get('REMOTE_ADDR', '')


def hash_ip(ip):
    if not ip:
        return ''
    return salted_hmac('adminpanel.audit-ip', ip, algorithm='sha256').hexdigest()[:16]


def record(action, *, target='', result='success', actor='admin', detail='', request=None):
    from .models import AuditLog

    request = request or current_request.get()
    try:
        AuditLog.objects.create(
            action=action[:40], actor=actor[:80], target=str(target)[:255], result=result,
            ip_hash=hash_ip(client_ip(request)) if request is not None else '',
            detail=str(detail)[:4000],
        )
    except Exception:   # le journal ne doit jamais casser l'action journalisée
        logger.exception('audit: écriture impossible (%s)', action)


class AuditContextMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        token = current_request.set(request)
        try:
            return self.get_response(request)
        finally:
            current_request.reset(token)
