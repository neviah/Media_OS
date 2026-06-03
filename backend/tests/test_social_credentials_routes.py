import importlib
import os
import uuid

import pytest
from fastapi.testclient import TestClient

pytest.importorskip("cryptography.fernet")


def _load_app_with_auth_disabled():
    os.environ['MEDIAOS_AUTH_ENABLED'] = '0'

    import backend.models.database as db_models
    import backend.main as backend_main

    db_models = importlib.reload(db_models)
    backend_main = importlib.reload(backend_main)
    db_models.Base.metadata.create_all(bind=backend_main.engine)
    return backend_main.app


def _create_workspace_avatar_channel(client: TestClient):
    suffix = uuid.uuid4().hex[:8]

    workspace = client.post(
        '/api/workspaces/',
        json={'name': f'Social Test Workspace {suffix}', 'description': 'social test scope'},
    ).json()

    avatar = client.post(
        '/api/avatars/',
        json={
            'workspace_id': workspace['id'],
            'name': f'Social Avatar {suffix}',
            'style_hints': None,
            'channel_type': 'news',
            'base_portrait_path': None,
            'reference_sheet_path': None,
            'voice_profile_id': None,
        },
    ).json()

    channel = client.post(
        '/api/channels/',
        json={
            'workspace_id': workspace['id'],
            'avatar_id': avatar['id'],
            'name': f'Social Channel {suffix}',
            'script_style_preset': 'informative',
            'music_policy': 'approved_only',
            'social_platform_credentials': None,
            'posting_schedule': None,
            'branding_colors': None,
            'intro_outro_paths': None,
            'is_active': True,
        },
    ).json()

    return workspace, channel


class _DummyTokenResponse:
    def raise_for_status(self):
        return None

    def json(self):
        return {
            'access_token': 'access-token',
            'refresh_token': 'refresh-token',
            'scope': 'https://www.googleapis.com/auth/youtube.upload',
            'token_type': 'Bearer',
            'expires_in': 3599,
        }


def test_social_oauth_youtube_start_and_complete(monkeypatch):
    app = _load_app_with_auth_disabled()

    import backend.api.routers.social_credentials as social_router

    monkeypatch.setattr(social_router.httpx, 'post', lambda *args, **kwargs: _DummyTokenResponse())

    client = TestClient(app)
    workspace, channel = _create_workspace_avatar_channel(client)

    start_response = client.post(
        '/api/social-credentials/oauth/start',
        json={
            'workspace_id': workspace['id'],
            'channel_id': channel['id'],
            'platform': 'youtube',
            'client_id': 'client-id',
            'client_secret': 'client-secret',
            'redirect_uri': 'http://127.0.0.1:8000/oauth/youtube/callback',
            'scopes': ['https://www.googleapis.com/auth/youtube.upload'],
            'login_hint': 'creator@example.com',
        },
    )

    assert start_response.status_code == 200
    start_body = start_response.json()
    assert 'accounts.google.com/o/oauth2/v2/auth' in start_body['authorization_url']
    assert start_body['state']

    callback_response = client.post(
        '/api/social-credentials/oauth/callback',
        json={
            'workspace_id': workspace['id'],
            'channel_id': channel['id'],
            'platform': 'youtube',
            'code': 'oauth-code',
            'state': start_body['state'],
            'account_hint': 'creator@example.com',
        },
    )

    assert callback_response.status_code == 200
    callback_body = callback_response.json()
    assert callback_body['is_connected'] is True
    assert callback_body['has_refresh_token'] is True
    assert callback_body['platform'] == 'youtube'


def test_social_secret_upsert_and_list():
    app = _load_app_with_auth_disabled()
    client = TestClient(app)

    workspace, _channel = _create_workspace_avatar_channel(client)

    upsert_response = client.post(
        '/api/social-credentials/secrets',
        json={
            'workspace_id': workspace['id'],
            'channel_id': None,
            'platform': 'x',
            'account_hint': 'newsbot@example.com',
            'secret_payload': {
                'username': 'newsbot@example.com',
                'password': 'top-secret',
            },
        },
    )

    assert upsert_response.status_code == 201
    body = upsert_response.json()
    assert body['platform'] == 'x'
    assert body['is_connected'] is True

    list_response = client.get(f"/api/social-credentials/?workspace_id={workspace['id']}")
    assert list_response.status_code == 200
    listed = list_response.json()
    assert any(item['platform'] == 'x' for item in listed)
