"""
Relevé des ressources du serveur (tâche Celery toutes les 5 minutes).

Les conteneurs Docker voient le /proc de l'hôte : CPU et mémoire sont ceux du VPS entier.
Le disque est celui de l'hôte (système de fichiers overlay du conteneur).
Temps de réponse et erreurs : lecture incrémentale des journaux d'accès nginx (montés en
lecture seule, format avec $request_time en dernier champ), reprise à l'octet près.
"""
import os
import re
import shutil

from django.conf import settings
from django.core.cache import cache
from django.db import connection

from .models import SystemSample

CPU_KEY = 'adminpanel:cpu:last'
LOG_KEY = 'adminpanel:log:{}'
MAX_READ = 20 * 1024 * 1024   # au plus 20 Mo de journal par relevé
# … "GET /proxy/v2/search?q=x HTTP/2.0" 200 1234 "-" "UA" 0.123
LINE_RE = re.compile(r'"[A-Z]+ (?P<path>\S+) [^"]*" (?P<status>\d{3}) .*?(?: (?P<time>\d+\.\d{3}))?$')


def read_cpu():
    """% d'occupation CPU depuis le relevé précédent (None au premier relevé)."""
    with open('/proc/stat') as fh:
        values = [int(v) for v in fh.readline().split()[1:]]
    idle, total = values[3] + values[4], sum(values[:8])
    previous = cache.get(CPU_KEY)
    cache.set(CPU_KEY, (idle, total), 3600)
    if not previous or total <= previous[1]:
        return None
    return round(100 * (1 - (idle - previous[0]) / (total - previous[1])), 1)


def read_memory():
    info = {}
    with open('/proc/meminfo') as fh:
        for line in fh:
            name, value = line.split(':', 1)
            info[name] = int(value.split()[0])   # kio
    total, available = info['MemTotal'], info.get('MemAvailable', info['MemFree'])
    return round(100 * (1 - available / total), 1), (total - available) // 1024, total // 1024


def read_load():
    with open('/proc/loadavg') as fh:
        return float(fh.read().split()[0])


def read_disk():
    usage = shutil.disk_usage(settings.METRICS_DISK_PATH)
    return round(100 * usage.used / usage.total, 1), round(usage.used / 1e9, 1), round(usage.total / 1e9, 1)


def read_db_size():
    with connection.cursor() as cursor:
        cursor.execute('SELECT pg_database_size(current_database())')
        return cursor.fetchone()[0] // (1024 * 1024)


def _new_lines(path):
    """Lignes ajoutées au journal depuis le dernier passage (rotation logrotate gérée)."""
    try:
        stat = os.stat(path)
    except OSError:
        return []
    key = LOG_KEY.format(path)
    state = cache.get(key)
    chunks = []
    if state is None:                       # premier passage : on part de la fin, sans relire l'historique
        cache.set(key, (stat.st_ino, stat.st_size), None)
        return []
    inode, offset = state
    if inode != stat.st_ino:                # rotation : finir l'ancien fichier (.1, non compressé) puis repartir de 0
        try:
            rotated = path + '.1'
            if os.stat(rotated).st_ino == inode:
                with open(rotated, 'rb') as fh:
                    fh.seek(offset)
                    chunks.append(fh.read(MAX_READ))
        except OSError:
            pass
        offset = 0
    elif stat.st_size < offset:             # fichier tronqué
        offset = 0
    with open(path, 'rb') as fh:
        fh.seek(offset)
        data = fh.read(MAX_READ)
    end = data.rfind(b'\n') + 1             # ne garder que des lignes complètes
    chunks.append(data[:end])
    cache.set(key, (stat.st_ino, offset + end), None)
    return b''.join(chunks).decode('utf-8', 'replace').splitlines()


def parse_lines(lines):
    """Agrège des lignes de journal nginx : nombre, temps moyen (global, API), p95, 4xx, 5xx."""
    times, api_times = [], []
    count = err4 = err5 = 0
    for line in lines:
        match = LINE_RE.search(line)
        if not match:
            continue
        count += 1
        status = int(match['status'])
        err4 += 400 <= status < 500
        err5 += status >= 500
        if match['time'] is not None:
            ms = float(match['time']) * 1000
            times.append(ms)
            if match['path'].startswith('/proxy/'):
                api_times.append(ms)
    times.sort()
    avg = lambda values: round(sum(values) / len(values), 1) if values else None  # noqa: E731
    return {
        'requests': count, 'errors_4xx': err4, 'errors_5xx': err5,
        'avg_response_ms': avg(times), 'api_avg_response_ms': avg(api_times),
        'p95_response_ms': round(times[int(0.95 * (len(times) - 1))], 1) if times else None,
    }


def collect():
    """Enregistre un relevé. Chaque mesure est facultative : une lecture impossible donne None."""
    sample = SystemSample()
    for fields, reader in (
        (('cpu_percent',), read_cpu), (('load1',), read_load),
        (('mem_percent', 'mem_used_mb', 'mem_total_mb'), read_memory),
        (('disk_percent', 'disk_used_gb', 'disk_total_gb'), read_disk),
        (('db_size_mb',), read_db_size),
    ):
        try:
            values = reader()
        except Exception:
            continue
        for field, value in zip(fields, values if isinstance(values, tuple) else (values,)):
            setattr(sample, field, value)
    lines = [line for path in settings.NGINX_ACCESS_LOGS for line in _new_lines(path)]
    for field, value in parse_lines(lines).items():
        setattr(sample, field, value)
    sample.save()
    return sample


# Seuils d'alerte : (attention, critique). Un dépassement colore la tuile et le graphique.
THRESHOLDS = {
    'cpu_percent': (70, 85),
    'mem_percent': (80, 90),
    'disk_percent': (80, 90),
    'error_5xx_rate': (1, 2),
    'api_avg_response_ms': (500, 1000),
}


def level(metric, value):
    if value is None:
        return 'none'
    warn, crit = THRESHOLDS[metric]
    return 'crit' if value >= crit else 'warn' if value >= warn else 'ok'
