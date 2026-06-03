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


def test_token_lifecycle_status_and_refresh_routes(monkeypatch):
    app = _load_app_with_auth_disabled()

    import backend.api.routers.system as system_router

    monkeypatch.setattr(
        system_router.token_lifecycle_service,
        'status',
        lambda: {'running': True, 'last_cycle_started_at': '2026-01-01T00:00:00+00:00', 'last_cycle_summary': {'checked': 3, 'refreshed': 2, 'warnings': 1, 'failed': 0}},
    )
    monkeypatch.setattr(
        system_router.token_lifecycle_service,
        'run_refresh_cycle',
        lambda force=False: {'checked': 4, 'refreshed': 3, 'warnings': 1, 'failed': 0},
    )

    client = TestClient(app)
    status_response = client.get('/api/system/token-lifecycle-status')
    assert status_response.status_code == 200
    assert status_response.json()['running'] is True

    refresh_response = client.post('/api/system/token-refresh-now')
    assert refresh_response.status_code == 200
    refresh_body = refresh_response.json()
    assert refresh_body['success'] is True
    assert refresh_body['summary']['refreshed'] == 3


def test_publish_preflight_route_returns_shape(monkeypatch):
    app = _load_app_with_auth_disabled()

    import backend.api.routers.system as system_router

    monkeypatch.setattr(
        system_router.publish_preflight_service,
        'run',
        lambda video_id, platform: {
            'ok': True,
            'video_id': video_id,
            'platform': platform,
            'checks': [
                {'key': 'video_exists', 'ok': True, 'detail': 'Video found'},
                {'key': 'social_credential', 'ok': True, 'detail': 'Credential found'},
            ],
        },
    )

    client = TestClient(app)
    response = client.get('/api/system/publish-preflight?video_id=5&platform=youtube')
    assert response.status_code == 200
    body = response.json()
    assert body['ok'] is True
    assert body['video_id'] == 5
    assert body['platform'] == 'youtube'
