"""
Conversation avec Claude (SDK officiel `anthropic`) et boucle des outils.

`converse()` est un générateur d'événements pour la vue (streaming SSE) :
    {'type': 'text', 'text': …}          morceau de réponse
    {'type': 'tool', 'name': …}          un outil est appelé (le widget affiche « recherche… »)
    {'type': 'done', …}                  fin : sources, statistiques pour le journal
La clé API vient de ANTHROPIC_API_KEY (variable d'environnement), jamais du dépôt.
"""
import json
import logging
import time
from pathlib import Path

import anthropic
from django.conf import settings

from .limits import cost_of
from .tools import TOOLS, run_tool

logger = logging.getLogger(__name__)

PROMPT = (Path(__file__).parent / 'prompt.md').read_text(encoding='utf-8')
MAX_ROUNDS = 4            # appels d'outils successifs au plus, avant de conclure
MAX_TOKENS = 2048         # réflexion comprise (Haiku 5.5 réfléchit par défaut) ; réponses courtes
LANGS = {'fr': 'français', 'en': 'anglais', 'ar': 'arabe', 'es': 'espagnol'}

ERROR_MESSAGES = {
    'unavailable': "L'assistant est momentanément indisponible. Réessayez dans quelques minutes.",
    'busy': "L'assistant est très sollicité. Réessayez dans un instant.",
    'refused': "Je ne peux pas répondre à cette demande. Je peux vous aider sur les produits et les ingrédients.",
    'incomplete': "Je n'ai pas pu terminer la recherche. Reformulez votre question ou précisez le produit.",
}


def get_client():
    return anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, timeout=25.0, max_retries=1)


def _context_block(portal, lang, context_code):
    site = 'Halal Open Food Facts (alimentaire)' if portal == 'food' else 'Halal Open Beauty Facts (cosmétiques)'
    lines = [f'Site : {site}.', f"Langue de l'interface : {LANGS.get(lang, 'français')}."]
    if context_code:
        lines.append(f'Fiche affichée par le visiteur : code {context_code} (lis-la avec get_product).')
    return '[Contexte fourni par le site]\n' + '\n'.join(lines)


def build_messages(question, history, portal, lang, context_code):
    messages = [{'role': m['role'], 'content': m['text']} for m in history]
    messages.append({'role': 'user', 'content': [
        {'type': 'text', 'text': _context_block(portal, lang, context_code)},
        {'type': 'text', 'text': question},
    ]})
    return messages


def converse(question, history, portal, lang='fr', context_code='', client=None, state=None):
    """`state` (dict) reçoit au fil de l'eau tokens et outils : si le visiteur ferme la fenêtre en cours
    de route, la vue journalise quand même le coût engagé."""
    client = client or get_client()
    started = time.monotonic()
    messages = build_messages(question, history, portal, lang, context_code)
    usage = {'input_tokens': 0, 'output_tokens': 0, 'cache_read_tokens': 0, 'cache_write_tokens': 0}
    tools_log, flags, products, sources = [], set(), [], {}
    answer, outcome = [], 'answered'
    if state is not None:
        state.update(usage=usage, tools=tools_log, product_codes=products, answer=answer, started=started)

    def emit_text(text):
        answer.append(text)
        return {'type': 'text', 'text': text}

    json_failures = 0
    try:
        for round_ in range(MAX_ROUNDS + 1):
            if round_ and answer and not answer[-1].endswith('\n'):
                yield emit_text('\n\n')
            try:
                with client.messages.stream(
                    model=settings.ASSISTANT_MODEL,
                    max_tokens=MAX_TOKENS,
                    system=[{'type': 'text', 'text': PROMPT, 'cache_control': {'type': 'ephemeral'}}],
                    tools=TOOLS,
                    messages=messages,
                    output_config={'effort': 'low'},
                ) as stream:
                    for event in stream:
                        if event.type == 'text' and event.text:
                            yield emit_text(event.text)
                    message = stream.get_final_message()
            except ValueError:
                logger.warning('assistant : entrée d\'outil illisible', exc_info=True)
                # Entrée d'outil illisible (streaming des entrées) : on rejoue le tour une fois
                json_failures += 1
                if json_failures > 1:
                    flags.add('tool_error')
                    outcome = 'error'
                    yield emit_text(ERROR_MESSAGES['unavailable'])
                    break
                continue

            u = message.usage
            usage['input_tokens'] += u.input_tokens or 0
            usage['output_tokens'] += u.output_tokens or 0
            usage['cache_read_tokens'] += getattr(u, 'cache_read_input_tokens', 0) or 0
            usage['cache_write_tokens'] += getattr(u, 'cache_creation_input_tokens', 0) or 0

            if message.stop_reason == 'refusal':
                outcome = 'refused'
                yield emit_text(ERROR_MESSAGES['refused'])
                break
            tool_uses = [b for b in message.content if b.type == 'tool_use']
            if message.stop_reason != 'tool_use' or not tool_uses:
                break
            if round_ == MAX_ROUNDS:
                flags.add('too_many_steps')
                yield emit_text(ERROR_MESSAGES['incomplete'])
                break

            messages.append({'role': 'assistant', 'content': message.content})
            results = []
            for block in tool_uses:
                yield {'type': 'tool', 'name': block.name}
                result, tool_flags, is_error = run_tool(portal, block.name, block.input)
                flags |= tool_flags
                tools_log.append({'name': block.name, 'input': block.input if isinstance(block.input, dict) else {}})
                for card in [result] if result.get('lien') else result.get('produits') or result.get('alternatives') or []:
                    if card.get('code') and card['code'] not in products:
                        products.append(card['code'])
                    if card.get('lien'):
                        name = card.get('nom') or (result.get('donnees_contributeurs') or {}).get('nom') or card['code']
                        sources[card['lien']] = name
                results.append({'type': 'tool_result', 'tool_use_id': block.id,
                                'content': json.dumps(result, ensure_ascii=False), 'is_error': is_error})
            messages.append({'role': 'user', 'content': results})
    except anthropic.APITimeoutError:
        outcome = 'error'
        yield emit_text(ERROR_MESSAGES['unavailable'])
    except anthropic.APIConnectionError:
        outcome = 'error'
        yield emit_text(ERROR_MESSAGES['unavailable'])
    except anthropic.RateLimitError:
        outcome = 'error'
        yield emit_text(ERROR_MESSAGES['busy'])
    except anthropic.AuthenticationError:
        logger.error('assistant : clé API refusée (ANTHROPIC_API_KEY)')
        outcome = 'error'
        yield emit_text(ERROR_MESSAGES['unavailable'])
    except anthropic.APIStatusError as error:
        logger.error('assistant : erreur API %s', error.status_code)
        outcome = 'error'
        yield emit_text(ERROR_MESSAGES['unavailable'])

    reason = next((f for f in ('ingredients_missing', 'too_many_steps', 'product_not_found', 'no_alternatives',
                               'ingredient_unknown', 'search_timeout', 'tool_error') if f in flags), '')
    if outcome == 'answered' and reason:
        outcome = 'unanswered'
    yield {
        'type': 'done',
        'sources': [{'url': url, 'name': name} for url, name in list(sources.items())[:5]],
        'stats': {
            'answer': ''.join(answer).strip(), 'outcome': outcome, 'unanswered_reason': reason,
            'tools': tools_log, 'product_codes': products[:20], **usage, 'cost_usd': cost_of(usage),
            'duration_ms': int((time.monotonic() - started) * 1000), 'model': settings.ASSISTANT_MODEL,
        },
    }
