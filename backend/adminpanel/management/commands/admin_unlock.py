"""Lève les blocages de connexion à l'espace de gestion (trop d'essais) : manage.py admin_unlock"""
from django.core.management.base import BaseCommand

from adminpanel.auth import unlock_all


class Command(BaseCommand):
    help = "Débloque les connexions à /gestion/ (par IP et blocage global)"

    def handle(self, *args, **options):
        removed = unlock_all()
        self.stdout.write(f'Blocages levés ({removed} compteurs par IP supprimés).')
