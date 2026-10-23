"""
API de Halal Assistant (relayée par nginx sous /proxy/v2/assistant) :

    GET  /api/v2/assistant/status   {"enabled": bool}  — le widget ne s'affiche que si l'assistant est activé
    POST /api/v2/assistant          {"question", "history": [{"role", "text"}], "code"?, "lang"?}
                                    → flux SSE : data: {"type": "text" | "tool" | "done" | "error", …}
"""
import json
import logging
import re
import time

from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_POST

from products.views import CODE_RE, _portal

from . import limits, llm
from .models import Exchange

logger = logging.getLogger(__name__)

MAX_QUESTION = 500
MAX_HISTORY = 6
MAX_HISTORY_ANSWER = 1500
CONTROL = re.compile(r'[\x00-\x08\x0b-\x1f\x7f]+')


def _clean(text, limit):
    return CONTROL.sub(' ', text).strip()[:limit] if isinstance(text, str) else ''


def parse_request(body):
    """Valide la demande. Renvoie (données, None) ou (None, message d'erreur)."""
    if not isinstance(body, dict) or not isinstance(body.get('question'), str):
        return None, 'Question attendue.'
    raw = CONTROL.sub(' ', body['question']).strip()
    if not raw:
        return None, 'Question vide.'
    if len(raw) > MAX_QUESTION:
        return None, f'Question trop longue ({MAX_QUESTION} caractères maximum).'
    history = []
    for item in (body.get('history') if isinstance(body.get('history'), list) else [])[-MAX_HISTORY:]:
        if isinstance(item, dict) and item.get('role') in ('user', 'assistant'):
            text = _clean(item.get('text'), MAX_QUESTION if item['role'] == 'user' else MAX_HISTORY_ANSWER)
            if text:
                history.append({'role': item['role'], 'text': text})
    while history and history[0]['role'] != 'user':   # l'API exige un premier message utilisateur
        history.pop(0)
    code = body.get('code') if isinstance(body.get('code'), str) and CODE_RE.match(body.get('code')) else ''
    lang = body.get('lang') if body.get('lang') in llm.LANGS else 'fr'
    return {'question': raw, 'history': history, 'code': code, 'lang': lang}, None


def _error(message, status):
    return JsonResponse({'error': message}, status=status)


@require_GET
def status(request):
    response = JsonResponse({'enabled': bool(settings.ASSISTANT_ENABLED and settings.ANTHROPIC_API_KEY)})
    response['Cache-Control'] = 'public, max-age=300'
    return response


def _log(params, portal, stats):
    try:
        Exchange.objects.create(
            portal=portal, lang=params['lang'], question=params['question'], context_code=params['code'],
            tools=stats['tools'], product_codes=stats['product_codes'], answer=stats['answer'][:4000],
            outcome=stats['outcome'], unanswered_reason=stats['unanswered_reason'],
            input_tokens=stats['input_tokens'], output_tokens=stats['output_tokens'],
            cache_read_tokens=stats['cache_read_tokens'], cache_write_tokens=stats['cache_write_tokens'],
            cost_usd=stats['cost_usd'], duration_ms=stats['duration_ms'], model=stats['model'],
        )
    except Exception:
        logger.exception('assistant : journal impossible')


def _sse(event):
    return f'data: {json.dumps(event, ensure_ascii=False)}\n\n'


def _stream(params, portal):
    state, logged = {}, False
    try:
        yield ': ok\n\n'   # premier octet tout de suite : le widget sait que la demande est acceptée
        for event in llm.converse(params['question'], params['history'], portal, params['lang'],
                                  params['code'], state=state):
            if event['type'] == 'done':
                _log(params, portal, event['stats'])
                logged = True
                yield _sse({'type': 'done', 'sources': event['sources']})
            else:
                yield _sse(event)
    except Exception:
        logger.exception('assistant : erreur inattendue')
        yield _sse({'type': 'error', 'message': llm.ERROR_MESSAGES['unavailable']})
    finally:
        if not logged and state:   # visiteur parti ou erreur : le coût engagé est quand même compté
            usage = state['usage']
            _log(params, portal, {
                'tools': state['tools'], 'product_codes': state['product_codes'], 'answer': ''.join(state['answer']),
                'outcome': 'error', 'unanswered_reason': 'interrupted', **usage, 'cost_usd': limits.cost_of(usage),
                'duration_ms': int((time.monotonic() - state['started']) * 1000), 'model': settings.ASSISTANT_MODEL,
            })


@csrf_exempt
@require_POST
def ask(request):
    if not settings.ASSISTANT_ENABLED:
        return _error("L'assistant n'est pas activé.", 404)
    if not settings.ANTHROPIC_API_KEY:
        return _error(llm.ERROR_MESSAGES['unavailable'], 503)
    try:
        body = json.loads(request.body[:8000] or b'{}')
    except (ValueError, UnicodeDecodeError):
        return _error('Requête illisible.', 400)
    params, problem = parse_request(body)
    if problem:
        return _error(problem, 400)
    if limits.budget_exhausted():
        return _error("L'assistant a atteint sa limite d'utilisation pour aujourd'hui. Revenez demain !", 503)
    refused = limits.check_rate(request)
    if refused:
        return _error(refused, 429)
    response = StreamingHttpResponse(_stream(params, _portal(request)), content_type='text/event-stream; charset=utf-8')
    response['Cache-Control'] = 'no-store'
    response['X-Accel-Buffering'] = 'no'   # nginx transmet chaque morceau sans attendre
    return response
