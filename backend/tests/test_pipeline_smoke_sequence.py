import importlib
import os
from types import SimpleNamespace

from fastapi.testclient import TestClient


def _load_app_with_env(auth_enabled: str, api_key: str, database_url: str):
    os.environ['MEDIAOS_AUTH_ENABLED'] = auth_enabled
    os.environ['MEDIAOS_API_KEY'] = api_key
    os.environ['DATABASE_URL'] = database_url

    import backend.database as backend_database
    import backend.main as backend_main

    backend_database = importlib.reload(backend_database)
    backend_main = importlib.reload(backend_main)

    return backend_main.app, backend_database.SessionLocal


def test_pipeline_smoke_sequence_with_seeded_records(tmp_path, monkeypatch):
    database_path = tmp_path / 'pipeline-smoke.db'
    database_url = f"sqlite:///{database_path.as_posix()}"
    app, session_local = _load_app_with_env(auth_enabled='1', api_key='secret', database_url=database_url)

    from backend.models.database import Audio, Avatar, Channel, Music, NewsSource, Script, Video, Workspace

    seeded_ids = {}

    with TestClient(app) as client:
        db = session_local()
        try:
            workspace = Workspace(name='Smoke Workspace', description='Pipeline smoke test workspace')
            db.add(workspace)
            db.flush()

            avatar = Avatar(
                workspace_id=workspace.id,
                name='Smoke Avatar',
                style_hints='clean',
                channel_type='news',
                base_portrait_path='avatars/base.png',
                voice_profile_id='voices/default.pt',
            )
            db.add(avatar)
            db.flush()

            channel = Channel(
                workspace_id=workspace.id,
                avatar_id=avatar.id,
                name='Smoke Channel',
                script_style_preset='informative',
                is_active=True,
            )
            db.add(channel)
            db.flush()

            news_source = NewsSource(
                workspace_id=workspace.id,
                name='Smoke News Source',
                source_url='https://example.com/feed',
                is_active=True,
            )
            db.add(news_source)
            db.flush()

            script = Script(
                workspace_id=workspace.id,
                channel_id=channel.id,
                news_source_id=news_source.id,
                title='Smoke Script',
                content='Smoke script content',
                summary='Smoke summary',
                hashtags='#smoke',
                is_validated=True,
            )
            db.add(script)
            db.flush()

            audio = Audio(
                workspace_id=workspace.id,
                channel_id=channel.id,
                script_id=script.id,
                file_path='audios/smoke.wav',
                voice_profile_id='voices/default.pt',
                duration=12.0,
                sample_rate=22050,
                is_normalized=True,
            )
            db.add(audio)
            db.flush()

            music = Music(
                workspace_id=workspace.id,
                title='Smoke Track',
                file_path='music/smoke.mp3',
                is_approved=True,
            )
            db.add(music)
            db.flush()

            video = Video(
                workspace_id=workspace.id,
                channel_id=channel.id,
                avatar_id=avatar.id,
                audio_id=audio.id,
                music_id=music.id,
                avatar_video_path='videos/avatar.mp4',
                final_video_path='videos/final.mp4',
                duration=30.0,
                is_approved=True,
            )
            db.add(video)
            db.commit()

            seeded_ids.update(
                {
                    'workspace_id': workspace.id,
                    'channel_id': channel.id,
                    'news_source_id': news_source.id,
                    'script_id': script.id,
                    'audio_id': audio.id,
                    'video_id': video.id,
                    'music_id': music.id,
                }
            )
        finally:
            db.close()

        calls = []

        class DummyNewsPipeline:
            def process_news_to_script(self, workspace_id, channel_id, news_source_id=None):
                assert workspace_id == seeded_ids['workspace_id']
                assert channel_id == seeded_ids['channel_id']
                assert news_source_id == seeded_ids['news_source_id']
                calls.append('news-to-script')
                return SimpleNamespace(id=seeded_ids['script_id'])

        class DummyScriptToVoicePipeline:
            def process_script_to_voice(self, script_id):
                assert script_id == seeded_ids['script_id']
                calls.append('script-to-voice')
                return SimpleNamespace(id=seeded_ids['audio_id'])

        class DummyVoiceToAvatarPipeline:
            def process_voice_to_avatar_video(self, audio_id):
                assert audio_id == seeded_ids['audio_id']
                calls.append('voice-to-avatar-video')
                return SimpleNamespace(id=seeded_ids['video_id'])

        class DummyVideoAssemblyPipeline:
            def process_video_assembly(self, video_id, music_id=None, b_roll_prompts=None):
                assert video_id == seeded_ids['video_id']
                assert music_id == seeded_ids['music_id']
                assert b_roll_prompts == ['city skyline']
                calls.append('video-assembly')
                return SimpleNamespace(id=seeded_ids['video_id'])

        class DummyPublishingPipeline:
            def publish_video(self, video_id, platform, schedule_time=None):
                assert video_id == seeded_ids['video_id']
                assert platform == 'youtube'
                calls.append('publish')
                return SimpleNamespace(id=999)

        import backend.api.routers.pipelines as pipeline_router

        monkeypatch.setattr(pipeline_router, '_get_news_to_script_pipeline_cls', lambda: DummyNewsPipeline)
        monkeypatch.setattr(pipeline_router, '_get_script_to_voice_pipeline_cls', lambda: DummyScriptToVoicePipeline)
        monkeypatch.setattr(pipeline_router, '_get_voice_to_avatar_pipeline_cls', lambda: DummyVoiceToAvatarPipeline)
        monkeypatch.setattr(pipeline_router, '_get_video_assembly_pipeline_cls', lambda: DummyVideoAssemblyPipeline)
        monkeypatch.setattr(pipeline_router, '_get_publishing_pipeline_cls', lambda: DummyPublishingPipeline)

        headers = {'x-api-key': 'secret', 'x-user-role': 'admin'}

        news_response = client.post(
            '/api/pipelines/news-to-script',
            json={
                'workspace_id': seeded_ids['workspace_id'],
                'channel_id': seeded_ids['channel_id'],
                'news_source_id': seeded_ids['news_source_id'],
            },
            headers=headers,
        )
        assert news_response.status_code == 200
        assert news_response.json()['success'] is True
        assert news_response.json()['script_id'] == seeded_ids['script_id']

        voice_response = client.post(
            '/api/pipelines/script-to-voice',
            json={'script_id': seeded_ids['script_id']},
            headers=headers,
        )
        assert voice_response.status_code == 200
        assert voice_response.json()['success'] is True
        assert voice_response.json()['audio_id'] == seeded_ids['audio_id']

        avatar_response = client.post(
            '/api/pipelines/voice-to-avatar-video',
            json={'audio_id': seeded_ids['audio_id']},
            headers=headers,
        )
        assert avatar_response.status_code == 200
        assert avatar_response.json()['success'] is True
        assert avatar_response.json()['video_id'] == seeded_ids['video_id']

        assembly_response = client.post(
            '/api/pipelines/video-assembly',
            json={
                'video_id': seeded_ids['video_id'],
                'music_id': seeded_ids['music_id'],
                'b_roll_prompts': ['city skyline'],
            },
            headers=headers,
        )
        assert assembly_response.status_code == 200
        assert assembly_response.json()['success'] is True
        assert assembly_response.json()['video_id'] == seeded_ids['video_id']

        publish_response = client.post(
            '/api/pipelines/publish',
            json={'video_id': seeded_ids['video_id'], 'platform': 'youtube', 'schedule_time': None},
            headers=headers,
        )
        assert publish_response.status_code == 200
        assert publish_response.json()['success'] is True
        assert publish_response.json()['publish_log_id'] == 999

        assert calls == [
            'news-to-script',
            'script-to-voice',
            'voice-to-avatar-video',
            'video-assembly',
            'publish',
        ]
