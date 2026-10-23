from django.urls import path

from . import views

app_name = 'adminpanel'

urlpatterns = [
    path('',             views.home,      name='home'),
    path('connexion',    views.login,     name='login'),
    path('deconnexion',  views.logout,    name='logout'),
    path('visites',      views.visits,    name='visits'),
    path('systeme',      views.system,    name='system'),
    path('journal',      views.audit_log, name='audit'),
    path('journal.csv',  views.audit_csv, name='audit-csv'),
]
