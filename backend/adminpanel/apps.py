from django.apps import AppConfig


class AdminPanelConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'adminpanel'
    verbose_name = 'Espace de gestion'

    def ready(self):
        import adminpanel.signals  # noqa: F401
