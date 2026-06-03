# backend/models/database.py
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey, Boolean, Float, UniqueConstraint
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import relationship
from datetime import datetime

Base = declarative_base()

class Workspace(Base):
    __tablename__ = 'workspaces'
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    description = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    avatars = relationship("Avatar", back_populates="workspace")
    channels = relationship("Channel", back_populates="workspace")
    music_library = relationship("Music", back_populates="workspace")
    news_sources = relationship("NewsSource", back_populates="workspace")
    scripts = relationship("Script", back_populates="workspace")
    audios = relationship("Audio", back_populates="workspace")
    videos = relationship("Video", back_populates="workspace")
    publish_logs = relationship("PublishLog", back_populates="workspace")
    publish_jobs = relationship("PublishJob", back_populates="workspace")
    metrics = relationship("Metrics", back_populates="workspace")
    social_credentials = relationship("SocialCredential", back_populates="workspace")

class Avatar(Base):
    __tablename__ = 'avatars'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    name = Column(String, nullable=False)
    style_hints = Column(Text)
    channel_type = Column(String)
    base_portrait_path = Column(String)
    reference_sheet_path = Column(String)
    voice_profile_id = Column(String)  # Reference to OpenVoice profile
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="avatars")
    channels = relationship("Channel", back_populates="avatar")

class Channel(Base):
    __tablename__ = 'channels'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    avatar_id = Column(Integer, ForeignKey('avatars.id'), nullable=False)
    name = Column(String, nullable=False)
    script_style_preset = Column(String)
    music_policy = Column(String)  # e.g., 'approved_only', 'any'
    social_platform_credentials = Column(Text)  # JSON string
    posting_schedule = Column(String)  # Cron expression or similar
    branding_colors = Column(String)  # JSON string
    intro_outro_paths = Column(String)  # JSON string for paths
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="channels")
    avatar = relationship("Avatar", back_populates="channels")
    scripts = relationship("Script", back_populates="channel")
    audios = relationship("Audio", back_populates="channel")
    videos = relationship("Video", back_populates="channel")
    publish_logs = relationship("PublishLog", back_populates="channel")
    publish_jobs = relationship("PublishJob", back_populates="channel")
    metrics = relationship("Metrics", back_populates="channel")
    social_credentials = relationship("SocialCredential", back_populates="channel")

class Music(Base):
    __tablename__ = 'music'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    title = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    tags = Column(String)  # Comma-separated tags
    mood = Column(String)
    duration = Column(Float)  # in seconds
    is_approved = Column(Boolean, default=False)
    generated_by = Column(String)  # e.g., 'MusicGen'
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="music_library")

class NewsSource(Base):
    __tablename__ = 'news_sources'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    name = Column(String, nullable=False)  # e.g., 'reddit'
    source_url = Column(String, nullable=False)  # e.g., 'https://www.reddit.com/r/technology/'
    keywords = Column(String)  # Comma-separated keywords
    pull_interval = Column(Integer)  # in minutes
    last_pulled = Column(DateTime)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="news_sources")

class Script(Base):
    __tablename__ = 'scripts'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    news_source_id = Column(Integer, ForeignKey('news_sources.id'))
    title = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    summary = Column(Text)
    hashtags = Column(String)  # Comma-separated hashtags
    is_validated = Column(Boolean, default=False)
    validation_notes = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="scripts")
    channel = relationship("Channel", back_populates="scripts")
    news_source = relationship("NewsSource")
    audios = relationship("Audio", back_populates="script")

class Audio(Base):
    __tablename__ = 'audios'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    script_id = Column(Integer, ForeignKey('scripts.id'), nullable=False)
    file_path = Column(String, nullable=False)
    voice_profile_id = Column(String)  # Reference to OpenVoice profile
    duration = Column(Float)  # in seconds
    sample_rate = Column(Integer)
    is_normalized = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="audios")
    channel = relationship("Channel", back_populates="audios")
    script = relationship("Script", back_populates="audios")
    videos = relationship("Video", back_populates="audio")

class Video(Base):
    __tablename__ = 'videos'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    avatar_id = Column(Integer, ForeignKey('avatars.id'))
    audio_id = Column(Integer, ForeignKey('audios.id'), nullable=False)
    music_id = Column(Integer, ForeignKey('music.id'))
    avatar_video_path = Column(String)  # Talking-head video from LivePortrait
    final_video_path = Column(String, nullable=False)  # After assembly with music, B-roll, captions
    b_roll_paths = Column(String)  # JSON string of paths
    captions = Column(Text)  # Generated captions
    duration = Column(Float)  # in seconds
    is_approved = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="videos")
    channel = relationship("Channel", back_populates="videos")
    avatar = relationship("Avatar")
    audio = relationship("Audio", back_populates="videos")
    music = relationship("Music")
    publish_logs = relationship("PublishLog", back_populates="video")
    publish_jobs = relationship("PublishJob", back_populates="video")
    metrics = relationship("Metrics", back_populates="video")

class PublishLog(Base):
    __tablename__ = 'publish_logs'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    video_id = Column(Integer, ForeignKey('videos.id'), nullable=False)
    platform = Column(String, nullable=False)  # e.g., 'youtube', 'tiktok'
    post_url = Column(String)
    status = Column(String, default='pending')  # pending, success, failed
    error_message = Column(Text)
    published_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="publish_logs")
    channel = relationship("Channel", back_populates="publish_logs")
    video = relationship("Video", back_populates="publish_logs")

class Metrics(Base):
    __tablename__ = 'metrics'
    
    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    video_id = Column(Integer, ForeignKey('videos.id'), nullable=False)
    platform = Column(String, nullable=False)  # e.g., 'youtube', 'tiktok'
    views = Column(Integer, default=0)
    likes = Column(Integer, default=0)
    comments = Column(Integer, default=0)
    watch_time = Column(Integer, default=0)  # in seconds
    subscribers_gained = Column(Integer, default=0)
    engagement_rate = Column(Float, default=0.0)
    snapshot_date = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    workspace = relationship("Workspace", back_populates="metrics")
    channel = relationship("Channel", back_populates="metrics")
    video = relationship("Video", back_populates="metrics")


class SocialCredential(Base):
    __tablename__ = 'social_credentials'
    __table_args__ = (
        UniqueConstraint('workspace_id', 'channel_id', 'platform', name='uq_social_credentials_scope_platform'),
    )

    id = Column(Integer, primary_key=True, index=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=True)
    platform = Column(String, nullable=False)  # e.g., 'youtube', 'tiktok', 'instagram', 'x'
    provider_account_hint = Column(String)
    encryption_version = Column(String, default='fernet-v1')
    oauth_state = Column(String)
    encrypted_payload = Column(Text, nullable=False)
    scopes = Column(String)  # Space-separated scopes
    is_connected = Column(Boolean, default=False)
    connected_at = Column(DateTime)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    workspace = relationship("Workspace", back_populates="social_credentials")
    channel = relationship("Channel", back_populates="social_credentials")
    audit_events = relationship("SocialCredentialAudit", back_populates="credential", cascade="all, delete-orphan")


class SocialCredentialAudit(Base):
    __tablename__ = 'social_credential_audit'

    id = Column(Integer, primary_key=True, index=True)
    credential_id = Column(Integer, ForeignKey('social_credentials.id'), nullable=False)
    action = Column(String, nullable=False)  # created, updated, oauth_start, oauth_callback, deleted, rotated
    actor = Column(String, nullable=False, default='system')
    details = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)

    credential = relationship("SocialCredential", back_populates="audit_events")


class PublishJob(Base):
    __tablename__ = 'publish_jobs'
    __table_args__ = (
        UniqueConstraint('idempotency_key', name='uq_publish_jobs_idempotency_key'),
    )

    id = Column(String, primary_key=True)
    workspace_id = Column(Integer, ForeignKey('workspaces.id'), nullable=False)
    channel_id = Column(Integer, ForeignKey('channels.id'), nullable=False)
    video_id = Column(Integer, ForeignKey('videos.id'), nullable=False)
    platform = Column(String, nullable=False)
    schedule_time = Column(Float)
    idempotency_key = Column(String)
    status = Column(String, default='queued')  # queued, running, retrying, succeeded, failed
    attempt = Column(Integer, default=0)
    max_attempts = Column(Integer, default=3)
    progress = Column(Integer, default=0)
    detail = Column(Text, default='queued')
    publish_log_id = Column(Integer, ForeignKey('publish_logs.id'))
    error_message = Column(Text)
    payload_json = Column(Text)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)

    workspace = relationship("Workspace", back_populates="publish_jobs")
    channel = relationship("Channel", back_populates="publish_jobs")
    video = relationship("Video", back_populates="publish_jobs")
    publish_log = relationship("PublishLog")