"""Faux client Claude : rejoue des tours scriptés, sans appel réseau ni coût."""
from types import SimpleNamespace


def text(value):
    return SimpleNamespace(type='text', text=value)


def tool_use(name, tool_input, block_id='toolu_1'):
    return SimpleNamespace(type='tool_use', id=block_id, name=name, input=tool_input)


def turn(*blocks, stop_reason=None, input_tokens=1000, output_tokens=100):
    if stop_reason is None:
        stop_reason = 'tool_use' if any(b.type == 'tool_use' for b in blocks) else 'end_turn'
    return SimpleNamespace(content=list(blocks), stop_reason=stop_reason, usage=SimpleNamespace(
        input_tokens=input_tokens, output_tokens=output_tokens,
        cache_read_input_tokens=0, cache_creation_input_tokens=0))


class FakeStream:
    def __init__(self, message):
        self.message = message

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False

    def __iter__(self):
        for block in self.message.content:
            if block.type == 'text':
                yield SimpleNamespace(type='text', text=block.text)

    def get_final_message(self):
        return self.message


class FakeClient:
    """`turns` : messages renvoyés tour après tour. `calls` garde les paramètres de chaque appel."""

    def __init__(self, *turns, error=None):
        self.turns = list(turns)
        self.calls = []
        self.error = error
        self.messages = self

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        if self.error is not None:
            raise self.error
        return FakeStream(self.turns.pop(0))

    def tool_results(self, call_index):
        """Contenu des tool_result envoyés au modèle lors de l'appel n° call_index."""
        last = self.calls[call_index]['messages'][-1]
        return [block for block in last['content'] if isinstance(block, dict) and block.get('type') == 'tool_result']
