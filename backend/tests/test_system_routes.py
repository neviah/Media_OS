import importlib
import os

from fastapi.testclient import TestClient


def _load_app_with_auth_disabled():
    os.environ['MEDIAOS_AUTH_ENABLED'] = '0'

    import backend.main as backend_main

    backend_main = importlib.reload(backend_main)
    return backend_main.app


def test_llm_status_route_returns_runtime_shape(monkeypatch):
    app = _load_app_with_auth_disabled()

    import backend.api.routers.system as system_router

    monkeypatch.setattr(
        system_router.llm_service,
        'get_runtime_status',
        lambda: {
            'override_model': None,
            'routing': {'default': 'openrouter:model'},
            'openrouter': {'configured': True, 'authenticated': True, 'error': None},
            'local': {'reachable': True, 'provider': 'lmstudio', 'error': None},
        },
    )

    client = TestClient(app)
    response = client.get('/api/system/llm-status')

    assert response.status_code == 200
    body = response.json()
    assert 'openrouter' in body
    assert 'local' in body
    assert 'routing' in body
