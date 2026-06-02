import importlib
import os
from types import SimpleNamespace

from fastapi.testclient import TestClient


class DummyNewsPipeline:
    def process_news_to_script(self, workspace_id, channel_id, news_source_id=None):
        return SimpleNamespace(id=101)


class DummyPublishingPipeline:
    def publish_video(self, video_id, platform, schedule_time=None):
        return SimpleNamespace(id=202)


def _load_app_with_env(auth_enabled: str, api_key: str):
    os.environ['MEDIAOS_AUTH_ENABLED'] = auth_enabled
    os.environ['MEDIAOS_API_KEY'] = api_key

    import backend.main as backend_main

    backend_main = importlib.reload(backend_main)
    return backend_main.app


def test_pipeline_write_allowed_when_auth_disabled(monkeypatch):
    app = _load_app_with_env(auth_enabled='0', api_key='')

    import backend.api.routers.pipelines as pipeline_router

    monkeypatch.setattr(pipeline_router, '_get_news_to_script_pipeline_cls', lambda: DummyNewsPipeline)

    client = TestClient(app)
    response = client.post(
        '/api/pipelines/news-to-script',
        json={'workspace_id': 1, 'channel_id': 1, 'news_source_id': None},
    )

    assert response.status_code == 200
    body = response.json()
    assert body['success'] is True
    assert body['script_id'] == 101


def test_pipeline_rejects_missing_api_key_when_auth_enabled():
    app = _load_app_with_env(auth_enabled='1', api_key='secret')

    client = TestClient(app)
    response = client.post(
        '/api/pipelines/news-to-script',
        json={'workspace_id': 1, 'channel_id': 1, 'news_source_id': None},
    )

    assert response.status_code == 401
    assert response.json()['detail'] == 'Invalid API key'


def test_pipeline_rejects_viewer_write_role_when_auth_enabled():
    app = _load_app_with_env(auth_enabled='1', api_key='secret')

    headers = {'x-api-key': 'secret', 'x-user-role': 'viewer'}

    client = TestClient(app)
    response = client.post(
        '/api/pipelines/news-to-script',
        json={'workspace_id': 1, 'channel_id': 1, 'news_source_id': None},
        headers=headers,
    )

    assert response.status_code == 403
    assert response.json()['detail'] == 'Insufficient role for write access'


def test_pipeline_publish_requires_admin(monkeypatch):
    app = _load_app_with_env(auth_enabled='1', api_key='secret')

    import backend.api.routers.pipelines as pipeline_router

    monkeypatch.setattr(pipeline_router, '_get_publishing_pipeline_cls', lambda: DummyPublishingPipeline)

    client = TestClient(app)

    editor_headers = {'x-api-key': 'secret', 'x-user-role': 'editor'}
    editor_response = client.post(
        '/api/pipelines/publish',
        json={'video_id': 1, 'platform': 'youtube', 'schedule_time': None},
        headers=editor_headers,
    )
    assert editor_response.status_code == 403
    assert editor_response.json()['detail'] == 'Admin role required'

    admin_headers = {'x-api-key': 'secret', 'x-user-role': 'admin'}
    admin_response = client.post(
        '/api/pipelines/publish',
        json={'video_id': 1, 'platform': 'youtube', 'schedule_time': None},
        headers=admin_headers,
    )
    assert admin_response.status_code == 200
    assert admin_response.json()['success'] is True
    assert admin_response.json()['publish_log_id'] == 202
