import React from 'react';
import { apiGet, apiPost } from '../lib/api';
import { useToast } from '../context/ToastContext';

const Home = () => {
  const { success, error: showError, info } = useToast();
  const [stats, setStats] = React.useState({ workspaces: 0, channels: 0, avatars: 0, videos: 0 });
  const [apiReady, setApiReady] = React.useState(true);
  const [busyStep, setBusyStep] = React.useState('');
  const [authForm, setAuthForm] = React.useState({
    apiKey: window.localStorage.getItem('mediaos_api_key') || '',
    role: window.localStorage.getItem('mediaos_role') || 'admin'
  });
  const [pipelineForm, setPipelineForm] = React.useState({
    workspace_id: '',
    channel_id: '',
    news_source_id: '',
    script_id: '',
    audio_id: '',
    video_id: '',
    music_id: '',
    platform: 'youtube',
    b_roll_prompts: ''
  });

  const parseRequiredId = (label, value) => {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      showError(`${label} must be a valid positive ID.`);
      return null;
    }
    return parsed;
  };

  const parseOptionalId = (value) => {
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const runNewsToScript = () => {
    const workspaceId = parseRequiredId('Workspace ID', pipelineForm.workspace_id);
    const channelId = parseRequiredId('Channel ID', pipelineForm.channel_id);
    const newsSourceId = parseOptionalId(pipelineForm.news_source_id);
    if (!workspaceId || !channelId) {
      return;
    }
    runPipelineStep('News to Script', '/api/pipelines/news-to-script', {
      workspace_id: workspaceId,
      channel_id: channelId,
      news_source_id: newsSourceId
    });
  };

  const runScriptToVoice = () => {
    const scriptId = parseRequiredId('Script ID', pipelineForm.script_id);
    if (!scriptId) {
      return;
    }
    runPipelineStep('Script to Voice', '/api/pipelines/script-to-voice', { script_id: scriptId });
  };

  const runVoiceToAvatar = () => {
    const audioId = parseRequiredId('Audio ID', pipelineForm.audio_id);
    if (!audioId) {
      return;
    }
    runPipelineStep('Voice to Avatar Video', '/api/pipelines/voice-to-avatar-video', { audio_id: audioId });
  };

  const runAssembly = () => {
    const videoId = parseRequiredId('Video ID', pipelineForm.video_id);
    if (!videoId) {
      return;
    }
    runPipelineStep('Video Assembly', '/api/pipelines/video-assembly', {
      video_id: videoId,
      music_id: parseOptionalId(pipelineForm.music_id),
      b_roll_prompts: pipelineForm.b_roll_prompts
        ? pipelineForm.b_roll_prompts.split(',').map((item) => item.trim()).filter(Boolean)
        : []
    });
  };

  const runPublish = () => {
    const videoId = parseRequiredId('Video ID', pipelineForm.video_id);
    if (!videoId) {
      return;
    }
    runPipelineStep('Publish', '/api/pipelines/publish', {
      video_id: videoId,
      platform: pipelineForm.platform
    });
  };

  React.useEffect(() => {
    const endpointMap = { workspaces: '/api/workspaces/', channels: '/api/channels/', avatars: '/api/avatars/', videos: '/api/videos/' };

    const loadStats = async () => {
      try {
        const entries = await Promise.all(Object.entries(endpointMap).map(async ([key, path]) => {
          const data = await apiGet(path);
          return [key, Array.isArray(data) ? data.length : 0];
        }));
        setStats(Object.fromEntries(entries));
        setApiReady(true);
      } catch {
        setApiReady(false);
      }
    };

    const hydratePipelineDefaults = async () => {
      try {
        const [workspaces, channels, sources, scripts, audios, videos, music] = await Promise.all([
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/news-sources/'),
          apiGet('/api/scripts/'),
          apiGet('/api/audios/'),
          apiGet('/api/videos/'),
          apiGet('/api/music/')
        ]);

        setPipelineForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaces[0] ? String(workspaces[0].id) : ''),
          channel_id: previous.channel_id || (channels[0] ? String(channels[0].id) : ''),
          news_source_id: previous.news_source_id || (sources[0] ? String(sources[0].id) : ''),
          script_id: previous.script_id || (scripts[0] ? String(scripts[0].id) : ''),
          audio_id: previous.audio_id || (audios[0] ? String(audios[0].id) : ''),
          video_id: previous.video_id || (videos[0] ? String(videos[0].id) : ''),
          music_id: previous.music_id || (music[0] ? String(music[0].id) : '')
        }));
      } catch {
        info('Pipeline defaults could not be auto-loaded yet.');
      }
    };

    loadStats();
    hydratePipelineDefaults();
    const intervalId = window.setInterval(loadStats, 20000);
    return () => window.clearInterval(intervalId);
  }, [info]);

  const runPipelineStep = async (label, path, payload) => {
    setBusyStep(label);
    try {
      const response = await apiPost(path, payload);
      if (response.success) {
        success(`${label} complete.`);
      } else {
        showError(response.detail || `${label} failed.`);
      }
    } catch {
      showError(`${label} failed.`);
    } finally {
      setBusyStep('');
    }
  };

  const saveAuthSettings = () => {
    window.localStorage.setItem('mediaos_api_key', authForm.apiKey.trim());
    window.localStorage.setItem('mediaos_role', authForm.role);
    success('API auth settings saved for this browser.');
  };

  const clearAuthSettings = () => {
    window.localStorage.removeItem('mediaos_api_key');
    window.localStorage.removeItem('mediaos_role');
    setAuthForm({ apiKey: '', role: 'admin' });
    info('API auth settings cleared.');
  };

  return (
    <div className="dashboard-root">
      <section className="hero-card reveal-up">
        <div className="hero-content">
          <p className="hero-tag">Automation Center</p>
          <h2>Build, voice, animate, and publish from one control panel.</h2>
          <p>Media Control Center is your local command bridge for the full content pipeline, from news intake and script generation to avatar delivery and social publishing.</p>
        </div>
        <div className="hero-grid" aria-label="Pipeline overview">
          <div className="metric-chip"><span>Workspaces</span><strong>{stats.workspaces}</strong></div>
          <div className="metric-chip"><span>Channels</span><strong>{stats.channels}</strong></div>
          <div className="metric-chip"><span>Avatars</span><strong>{stats.avatars}</strong></div>
          <div className="metric-chip"><span>Videos</span><strong>{stats.videos}</strong></div>
        </div>
      </section>

      <section className="feature-grid reveal-up delay-1">
        <article className="feature-card"><h3>Avatar Lab</h3><p>Create host personas, voice profiles, and multi-angle reference sets for production use.</p></article>
        <article className="feature-card"><h3>Channel Control</h3><p>Map each channel to brand voice, schedule cadence, music policy, and publishing destinations.</p></article>
        <article className="feature-card"><h3>Music Curation</h3><p>Generate and approve tracks by mood and tempo, then auto-match them during final assembly.</p></article>
      </section>

      <section className="pipeline-strip reveal-up delay-2">
        <h3>Pipeline Stages</h3>
        <div className="stage-list">
          <span>{apiReady ? 'Fetch' : 'API Down'}</span>
          <span>{apiReady ? 'Write' : 'Reconnect'}</span>
          <span>{apiReady ? 'Voice' : 'Pending'}</span>
          <span>{apiReady ? 'Animate' : 'Pending'}</span>
          <span>{apiReady ? 'Assemble' : 'Pending'}</span>
          <span>{apiReady ? 'Publish' : 'Pending'}</span>
        </div>
      </section>

      <section className="feature-card reveal-up delay-2">
        <h3>First-Run Setup Checklist</h3>
        <p style={{ marginTop: '0.4rem' }}>Complete these in order before running pipeline actions.</p>
        <div className="stage-list" style={{ marginTop: '0.8rem' }}>
          <a href="/workspaces">{stats.workspaces > 0 ? 'Done' : 'Missing'}: Create a workspace</a>
          <a href="/avatars">{stats.avatars > 0 ? 'Done' : 'Missing'}: Create an avatar</a>
          <a href="/channels">{stats.channels > 0 ? 'Done' : 'Missing'}: Create a channel linked to that avatar</a>
          <a href="/news-sources">Open: Add at least one RSS or Reddit news source</a>
          <a href="/scripts">Optional: Review generated scripts before voice</a>
        </div>
      </section>

      <section className="feature-card reveal-up delay-2">
        <h3>API Auth Settings</h3>
        <p style={{ marginTop: '0.4rem' }}>Saved locally and sent as x-api-key and x-user-role on API requests.</p>

        <div className="stage-list" style={{ marginTop: '0.8rem' }}>
          <label>
            API Key
            <input
              className="form-input"
              type="password"
              value={authForm.apiKey}
              onChange={(event) => setAuthForm((previous) => ({ ...previous, apiKey: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
              autoComplete="off"
              placeholder="Enter MEDIAOS_API_KEY"
            />
          </label>
          <label>
            Role
            <select
              className="form-input"
              value={authForm.role}
              onChange={(event) => setAuthForm((previous) => ({ ...previous, role: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="viewer">viewer</option>
              <option value="editor">editor</option>
              <option value="admin">admin</option>
            </select>
          </label>
        </div>

        <div className="table-toolbar" style={{ marginTop: '0.9rem' }}>
          <div className="toolbar-group">
            <button className="tiny-button" type="button" onClick={saveAuthSettings}>Save Auth</button>
            <button className="tiny-button" type="button" onClick={clearAuthSettings}>Clear Auth</button>
          </div>
        </div>
      </section>

      <section className="feature-card reveal-up delay-2">
        <h3>Run Pipeline Actions</h3>
        <p style={{ marginTop: '0.4rem' }}>Trigger backend pipeline jobs directly for fast smoke-testing.</p>

        <div className="stage-list" style={{ marginTop: '0.8rem' }}>
          <label>Workspace ID<input className="form-input" value={pipelineForm.workspace_id} onChange={(event) => setPipelineForm((previous) => ({ ...previous, workspace_id: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
          <label>Channel ID<input className="form-input" value={pipelineForm.channel_id} onChange={(event) => setPipelineForm((previous) => ({ ...previous, channel_id: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
          <label>News Source ID<input className="form-input" value={pipelineForm.news_source_id} onChange={(event) => setPipelineForm((previous) => ({ ...previous, news_source_id: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
          <label>Script ID<input className="form-input" value={pipelineForm.script_id} onChange={(event) => setPipelineForm((previous) => ({ ...previous, script_id: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
          <label>Audio ID<input className="form-input" value={pipelineForm.audio_id} onChange={(event) => setPipelineForm((previous) => ({ ...previous, audio_id: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
          <label>Video ID<input className="form-input" value={pipelineForm.video_id} onChange={(event) => setPipelineForm((previous) => ({ ...previous, video_id: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
          <label>Music ID<input className="form-input" value={pipelineForm.music_id} onChange={(event) => setPipelineForm((previous) => ({ ...previous, music_id: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
          <label>Platform<select className="form-input" value={pipelineForm.platform} onChange={(event) => setPipelineForm((previous) => ({ ...previous, platform: event.target.value }))} style={{ marginTop: '0.35rem' }}><option value="youtube">youtube</option><option value="tiktok">tiktok</option><option value="instagram">instagram</option><option value="x">x</option></select></label>
          <label>B-roll Prompts<input className="form-input" value={pipelineForm.b_roll_prompts} onChange={(event) => setPipelineForm((previous) => ({ ...previous, b_roll_prompts: event.target.value }))} style={{ marginTop: '0.35rem' }} /></label>
        </div>

        <div className="table-toolbar" style={{ marginTop: '0.9rem' }}>
          <div className="toolbar-group">
            <button className="tiny-button" type="button" disabled={Boolean(busyStep)} onClick={runNewsToScript}>Run News -> Script</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep)} onClick={runScriptToVoice}>Run Script -> Voice</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep)} onClick={runVoiceToAvatar}>Run Voice -> Avatar</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep)} onClick={runAssembly}>Run Assembly</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep)} onClick={runPublish}>Run Publish</button>
          </div>
        </div>

        {busyStep ? <p className="text-sm text-gray-500">Running: {busyStep}...</p> : null}
      </section>
    </div>
  );
};

export default Home;
