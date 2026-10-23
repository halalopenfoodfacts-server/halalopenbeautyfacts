"""
Génère le hash argon2 du code d'accès à l'espace de gestion. Le code n'est jamais affiché ni stocké.

    docker exec -it halal_django python manage.py admin_code_hash

Copier la ligne affichée dans /home/debian/halal-frontend/.env (avec ses guillemets simples :
docker compose n'interprète pas les « $ » entre guillemets simples), puis redémarrer Django.
"""
import getpass

from argon2 import PasswordHasher
from django.core.management.base import BaseCommand, CommandError

MIN_LENGTH = 12


class Command(BaseCommand):
    help = "Hash argon2 du code d'accès à /gestion/ (à mettre dans ADMIN_CODE_HASH)"

    def handle(self, *args, **options):
        code = getpass.getpass('Code secret (12 caractères minimum) : ').strip()
        if len(code) < MIN_LENGTH:
            raise CommandError(f'Code trop court : {MIN_LENGTH} caractères minimum.')
        if getpass.getpass('Confirmez : ').strip() != code:
            raise CommandError('Les deux saisies diffèrent.')
        encoded = PasswordHasher().hash(code)
        self.stdout.write('\nAjoutez cette ligne au fichier .env :\n')
        self.stdout.write(f"ADMIN_CODE_HASH='{encoded}'\n")
        self.stdout.write('puis : docker compose up -d --no-deps django\n')
