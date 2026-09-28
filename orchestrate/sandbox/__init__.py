"""Sandbox workflow verification with lazy public exports.

Keeping package import side-effect free lets the static validator import i18n
without recursively importing its own report models.
"""

from importlib import import_module

__all__ = [
    "ContextTrace",
    "SandboxRunReport",
    "StubAgentRuntime",
    "StubScenario",
    "StubTemplate",
    "run_sandbox",
]


def __getattr__(name: str):
    if name not in __all__:
        raise AttributeError(name)
    module = {
        "run_sandbox": ".runner",
        "StubAgentRuntime": ".stub_runtime",
    }.get(name, ".models")
    return getattr(import_module(module, __name__), name)
