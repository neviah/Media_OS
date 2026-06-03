import React from 'react';
import { apiGet, apiPost } from '../lib/api';
import { useToast } from '../context/ToastContext';

const Home = () => {
  const { success, error: showError, info } = useToast();

  const [stats, setStats] = React.useState({ workspaces: 0, channels: 0, avatars: 0, videos: 0 });
  const [entities, setEntities] = React.useState({
    workspaces: [],
    channels: [],
    sources: [],
    scripts: [],
    audios: [],
    videos: [],
    music: []
  });
  const [llmStatus, setLlmStatus] = React.useState(null);
  const [apiReady, setApiReady] = React.useState(true);
  const [busyStep, setBusyStep] = React.useState('');
  const [setupBusy, setSetupBusy] = React.useState(false);

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

  const [setupForm, setSetupForm] = React.useState({
    existing_workspace_id: '',
    workspace_name: 'Starter Workspace',
    workspace_description: 'Created from guided setup',
    avatar_name: 'Main Host',
    avatar_style_hints: 'clean, friendly, newsroom',
    channel_name: 'Main Channel',
    script_style_preset: 'informative',
    news_source_name: 'Tech RSS',
    news_source_url: 'https://feeds.bbci.co.uk/news/technology/rss.xml',
    news_keywords: 'ai,technology'
  });

  const parseOptionalId = (value) => {
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  };

  const channelOptions = React.useMemo(() => {
    if (!pipelineForm.workspace_id) {
      return entities.channels;
    }
    return entities.channels.filter((item) => String(item.workspace_id) === pipelineForm.workspace_id);
  }, [entities.channels, pipelineForm.workspace_id]);

  const sourceOptions = React.useMemo(() => {
    if (!pipelineForm.workspace_id) {
      return entities.sources;
    }
    return entities.sources.filter((item) => String(item.workspace_id) === pipelineForm.workspace_id);
  }, [entities.sources, pipelineForm.workspace_id]);

  const scriptOptions = React.useMemo(() => {
    if (!pipelineForm.workspace_id) {
      return entities.scripts;
    }
    return entities.scripts.filter((item) => String(item.workspace_id) === pipelineForm.workspace_id);
  }, [entities.scripts, pipelineForm.workspace_id]);

  const audioOptions = React.useMemo(() => {
    if (!pipelineForm.workspace_id) {
      return entities.audios;
    }
    return entities.audios.filter((item) => String(item.workspace_id) === pipelineForm.workspace_id);
  }, [entities.audios, pipelineForm.workspace_id]);

  const videoOptions = React.useMemo(() => {
    if (!pipelineForm.workspace_id) {
      return entities.videos;
    }
    return entities.videos.filter((item) => String(item.workspace_id) === pipelineForm.workspace_id);
  }, [entities.videos, pipelineForm.workspace_id]);

  const musicOptions = React.useMemo(() => {
    if (!pipelineForm.workspace_id) {
      return entities.music;
    }
    return entities.music.filter((item) => String(item.workspace_id) === pipelineForm.workspace_id);
  }, [entities.music, pipelineForm.workspace_id]);

  const pipelineReady = React.useMemo(() => ({
    newsToScript: Boolean(pipelineForm.workspace_id && pipelineForm.channel_id),
    scriptToVoice: Boolean(pipelineForm.script_id),
    voiceToAvatar: Boolean(pipelineForm.audio_id),
    assembly: Boolean(pipelineForm.video_id),
    publish: Boolean(pipelineForm.video_id && pipelineForm.platform)
  }), [pipelineForm]);

  const loadDashboardState = React.useCallback(async () => {
    const endpointMap = {
      workspaces: '/api/workspaces/',
      channels: '/api/channels/',
      avatars: '/api/avatars/',
      videos: '/api/videos/'
    };

    try {
      const [entries, workspaces, channels, sources, scripts, audios, videos, music, llm] = await Promise.all([
        Promise.all(Object.entries(endpointMap).map(async ([key, path]) => {
          const data = await apiGet(path);
          return [key, Array.isArray(data) ? data.length : 0];
        })),
        apiGet('/api/workspaces/'),
        apiGet('/api/channels/'),
        apiGet('/api/news-sources/'),
        apiGet('/api/scripts/'),
        apiGet('/api/audios/'),
        apiGet('/api/videos/'),
        apiGet('/api/music/'),
        apiGet('/api/system/llm-status')
      ]);

      setStats(Object.fromEntries(entries));
      setEntities({ workspaces, channels, sources, scripts, audios, videos, music });
      setLlmStatus(llm);
      setApiReady(true);

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

      setSetupForm((previous) => ({
        ...previous,
        existing_workspace_id: previous.existing_workspace_id || (workspaces[0] ? String(workspaces[0].id) : '')
      }));
    } catch {
      setApiReady(false);
    }
  }, []);

  React.useEffect(() => {
    loadDashboardState();
    const intervalId = window.setInterval(loadDashboardState, 20000);
    return () => window.clearInterval(intervalId);
  }, [loadDashboardState]);

  React.useEffect(() => {
    setPipelineForm((previous) => {
      const next = { ...previous };
      if (next.channel_id && !channelOptions.some((item) => String(item.id) === next.channel_id)) {
        next.channel_id = '';
      }
      if (next.news_source_id && !sourceOptions.some((item) => String(item.id) === next.news_source_id)) {
        next.news_source_id = '';
      }
      if (next.script_id && !scriptOptions.some((item) => String(item.id) === next.script_id)) {
        next.script_id = '';
      }
      if (next.audio_id && !audioOptions.some((item) => String(item.id) === next.audio_id)) {
        next.audio_id = '';
      }
      if (next.video_id && !videoOptions.some((item) => String(item.id) === next.video_id)) {
        next.video_id = '';
      }
      if (next.music_id && !musicOptions.some((item) => String(item.id) === next.music_id)) {
        next.music_id = '';
      }
      return next;
    });
  }, [channelOptions, sourceOptions, scriptOptions, audioOptions, videoOptions, musicOptions]);

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

  const runNewsToScript = () => {
    if (!pipelineReady.newsToScript) {
      showError('Select workspace and channel before running News to Script.');
      return;
    }
    runPipelineStep('News to Script', '/api/pipelines/news-to-script', {
      workspace_id: Number(pipelineForm.workspace_id),
      channel_id: Number(pipelineForm.channel_id),
      news_source_id: parseOptionalId(pipelineForm.news_source_id)
    });
  };

  const runScriptToVoice = () => {
    if (!pipelineReady.scriptToVoice) {
      showError('Select a script before running Script to Voice.');
      return;
    }
    runPipelineStep('Script to Voice', '/api/pipelines/script-to-voice', {
      script_id: Number(pipelineForm.script_id)
    });
  };

  const runVoiceToAvatar = () => {
    if (!pipelineReady.voiceToAvatar) {
      showError('Select an audio record before running Voice to Avatar.');
      return;
    }
    runPipelineStep('Voice to Avatar Video', '/api/pipelines/voice-to-avatar-video', {
      audio_id: Number(pipelineForm.audio_id)
    });
  };

  const runAssembly = () => {
    if (!pipelineReady.assembly) {
      showError('Select a video before running Video Assembly.');
      return;
    }
    runPipelineStep('Video Assembly', '/api/pipelines/video-assembly', {
      video_id: Number(pipelineForm.video_id),
      music_id: parseOptionalId(pipelineForm.music_id),
      b_roll_prompts: pipelineForm.b_roll_prompts
        ? pipelineForm.b_roll_prompts.split(',').map((item) => item.trim()).filter(Boolean)
        : []
    });
  };

  const runPublish = () => {
    if (!pipelineReady.publish) {
      showError('Select a video and platform before running Publish.');
      return;
    }
    runPipelineStep('Publish', '/api/pipelines/publish', {
      video_id: Number(pipelineForm.video_id),
      platform: pipelineForm.platform
    });
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

  const runGuidedSetup = async ({ idempotent = false } = {}) => {
    const workspaceName = setupForm.workspace_name.trim();
    const avatarName = setupForm.avatar_name.trim();
    const channelName = setupForm.channel_name.trim();
    const sourceName = setupForm.news_source_name.trim();
    const sourceUrl = setupForm.news_source_url.trim();

    if (!setupForm.existing_workspace_id && !workspaceName) {
      showError('Workspace name is required when not using an existing workspace.');
      return;
    }
    if (!avatarName || !channelName || !sourceName || !sourceUrl) {
      showError('Avatar name, channel name, source name, and source URL are required.');
      return;
    }

    setSetupBusy(true);
    try {
      let workspaceId = Number(setupForm.existing_workspace_id);
      if (!workspaceId) {
        if (idempotent) {
          const existingWorkspace = entities.workspaces.find(
            (item) => item.name.trim().toLowerCase() === workspaceName.toLowerCase()
          );
          if (existingWorkspace) {
            workspaceId = existingWorkspace.id;
          }
        }

        if (!workspaceId) {
          const workspace = await apiPost('/api/workspaces/', {
            name: workspaceName,
            description: setupForm.workspace_description.trim() || null
          });
          workspaceId = workspace.id;
        }
      }

      let avatar = null;
      if (idempotent) {
        const avatars = await apiGet('/api/avatars/');
        avatar = avatars.find(
          (item) => Number(item.workspace_id) === workspaceId && item.name.trim().toLowerCase() === avatarName.toLowerCase()
        ) || null;
      }

      if (!avatar) {
        avatar = await apiPost('/api/avatars/', {
          workspace_id: workspaceId,
          name: avatarName,
          style_hints: setupForm.avatar_style_hints.trim() || null,
          channel_type: 'news',
          base_portrait_path: null,
          reference_sheet_path: null,
          voice_profile_id: null
        });
      }

      let channel = null;
      if (idempotent) {
        const channels = await apiGet('/api/channels/');
        channel = channels.find(
          (item) => Number(item.workspace_id) === workspaceId && item.name.trim().toLowerCase() === channelName.toLowerCase()
        ) || null;
      }

      if (!channel) {
        channel = await apiPost('/api/channels/', {
          workspace_id: workspaceId,
          avatar_id: avatar.id,
          name: channelName,
          script_style_preset: setupForm.script_style_preset,
          music_policy: 'approved_only',
          social_platform_credentials: null,
          posting_schedule: null,
          branding_colors: null,
          intro_outro_paths: null,
          is_active: true
        });
      }

      let source = null;
      if (idempotent) {
        const sources = await apiGet('/api/news-sources/');
        source = sources.find(
          (item) => Number(item.workspace_id) === workspaceId && item.name.trim().toLowerCase() === sourceName.toLowerCase()
        ) || null;
      }

      if (!source) {
        source = await apiPost('/api/news-sources/', {
          workspace_id: workspaceId,
          name: sourceName,
          source_url: sourceUrl,
          keywords: setupForm.news_keywords.trim() || null,
          pull_interval: 60,
          is_active: true
        });
      }

      await loadDashboardState();

      setPipelineForm((previous) => ({
        ...previous,
        workspace_id: String(workspaceId),
        channel_id: String(channel.id),
        news_source_id: String(source.id)
      }));
      setSetupForm((previous) => ({
        ...previous,
        existing_workspace_id: String(workspaceId)
      }));

      success(`Guided setup complete: workspace #${workspaceId}, avatar #${avatar.id}, channel #${channel.id}, source #${source.id}.`);
    } catch {
      showError('Guided setup failed. Check form values and auth role, then retry.');
    } finally {
      setSetupBusy(false);
    }
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
        <h3>Guided Setup Wizard</h3>
        <p style={{ marginTop: '0.4rem' }}>Creates Workspace -> Avatar -> Channel -> News Source in one pass.</p>

        <div className="stage-list" style={{ marginTop: '0.8rem' }}>
          <label>
            Existing Workspace (optional)
            <select
              className="form-input"
              value={setupForm.existing_workspace_id}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, existing_workspace_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">Create new workspace</option>
              {entities.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name} (#{item.id})</option>)}
            </select>
          </label>
          <label>
            Workspace Name
            <input
              className="form-input"
              value={setupForm.workspace_name}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, workspace_name: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
              disabled={Boolean(setupForm.existing_workspace_id)}
            />
          </label>
          <label>
            Workspace Description
            <input
              className="form-input"
              value={setupForm.workspace_description}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, workspace_description: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
              disabled={Boolean(setupForm.existing_workspace_id)}
            />
          </label>
          <label>
            Avatar Name
            <input
              className="form-input"
              value={setupForm.avatar_name}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, avatar_name: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            />
          </label>
          <label>
            Avatar Style Hints
            <input
              className="form-input"
              value={setupForm.avatar_style_hints}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, avatar_style_hints: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            />
          </label>
          <label>
            Channel Name
            <input
              className="form-input"
              value={setupForm.channel_name}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, channel_name: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            />
          </label>
          <label>
            Script Style
            <select
              className="form-input"
              value={setupForm.script_style_preset}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, script_style_preset: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="informative">informative</option>
              <option value="energetic">energetic</option>
              <option value="professional">professional</option>
            </select>
          </label>
          <label>
            News Source Name
            <input
              className="form-input"
              value={setupForm.news_source_name}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, news_source_name: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            />
          </label>
          <label>
            News Source URL
            <input
              className="form-input"
              value={setupForm.news_source_url}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, news_source_url: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            />
          </label>
          <label>
            News Keywords
            <input
              className="form-input"
              value={setupForm.news_keywords}
              onChange={(event) => setSetupForm((previous) => ({ ...previous, news_keywords: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            />
          </label>
        </div>

        <div className="table-toolbar" style={{ marginTop: '0.9rem' }}>
          <div className="toolbar-group">
            <button className="tiny-button" type="button" disabled={setupBusy} onClick={runGuidedSetup}>
              {setupBusy ? 'Running Setup...' : 'Run Guided Setup'}
            </button>
            <button
              className="tiny-button"
              type="button"
              disabled={setupBusy}
              onClick={() => runGuidedSetup({ idempotent: true })}
              title="Reuse existing named workspace/avatar/channel/source when available"
            >
              {setupBusy ? 'Running Setup...' : 'Run Defaults (Idempotent)'}
            </button>
          </div>
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
        <h3>LLM Runtime Status</h3>
        {llmStatus ? (
          <div className="stage-list" style={{ marginTop: '0.8rem' }}>
            <div>
              OpenRouter: {llmStatus.openrouter.authenticated ? 'Connected' : 'Not ready'}
              {llmStatus.openrouter.error ? ` (${llmStatus.openrouter.error})` : ''}
            </div>
            <div>
              Local provider: {llmStatus.local.reachable ? `Connected (${llmStatus.local.provider || 'detected'})` : 'Not ready'}
              {llmStatus.local.error ? ` (${llmStatus.local.error})` : ''}
            </div>
            <div>Local model: {llmStatus.local.model || 'local-model'}</div>
            <div>Override model: {llmStatus.override_model || 'none'}</div>
          </div>
        ) : (
          <p style={{ marginTop: '0.5rem' }}>Loading LLM status...</p>
        )}
      </section>

      <section className="feature-card reveal-up delay-2">
        <h3>Run Pipeline Actions</h3>
        <p style={{ marginTop: '0.4rem' }}>Select existing records, then trigger each stage. Buttons stay disabled until required inputs exist.</p>

        <div className="stage-list" style={{ marginTop: '0.8rem' }}>
          <label>
            Workspace
            <select
              className="form-input"
              value={pipelineForm.workspace_id}
              onChange={(event) => setPipelineForm((previous) => ({ ...previous, workspace_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">Select workspace</option>
              {entities.workspaces.map((item) => <option key={item.id} value={item.id}>{item.name} (#{item.id})</option>)}
            </select>
          </label>
          <label>
            Channel
            <select
              className="form-input"
              value={pipelineForm.channel_id}
              onChange={(event) => setPipelineForm((previous) => ({ ...previous, channel_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">Select channel</option>
              {channelOptions.map((item) => <option key={item.id} value={item.id}>{item.name} (#{item.id})</option>)}
            </select>
          </label>
          <label>
            News Source
            <select
              className="form-input"
              value={pipelineForm.news_source_id}
              onChange={(event) => setPipelineForm((previous) => ({ ...previous, news_source_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">Auto-select by workspace</option>
              {sourceOptions.map((item) => <option key={item.id} value={item.id}>{item.name} (#{item.id})</option>)}
            </select>
          </label>
          <label>
            Script
            <select
              className="form-input"
              value={pipelineForm.script_id}
              onChange={(event) => setPipelineForm((previous) => ({ ...previous, script_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">Select script</option>
              {scriptOptions.map((item) => <option key={item.id} value={item.id}>{item.title || `Script #${item.id}`}</option>)}
            </select>
          </label>
          <label>
            Audio
            <select
              className="form-input"
              value={pipelineForm.audio_id}
              onChange={(event) => setPipelineForm((previous) => ({ ...previous, audio_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">Select audio</option>
              {audioOptions.map((item) => <option key={item.id} value={item.id}>Audio #{item.id} (script #{item.script_id})</option>)}
            </select>
          </label>
          <label>
            Video
            <select
              className="form-input"
              value={pipelineForm.video_id}
              onChange={(event) => setPipelineForm((previous) => ({ ...previous, video_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">Select video</option>
              {videoOptions.map((item) => <option key={item.id} value={item.id}>Video #{item.id} (audio #{item.audio_id})</option>)}
            </select>
          </label>
          <label>
            Music
            <select
              className="form-input"
              value={pipelineForm.music_id}
              onChange={(event) => setPipelineForm((previous) => ({ ...previous, music_id: event.target.value }))}
              style={{ marginTop: '0.35rem' }}
            >
              <option value="">None</option>
              {musicOptions.map((item) => <option key={item.id} value={item.id}>{item.title || `Music #${item.id}`}</option>)}
            </select>
          </label>
          <label>
            Platform
            <select className="form-input" value={pipelineForm.platform} onChange={(event) => setPipelineForm((previous) => ({ ...previous, platform: event.target.value }))} style={{ marginTop: '0.35rem' }}>
              <option value="youtube">youtube</option>
              <option value="tiktok">tiktok</option>
              <option value="instagram">instagram</option>
              <option value="x">x</option>
            </select>
          </label>
          <label>
            B-roll Prompts
            <input className="form-input" value={pipelineForm.b_roll_prompts} onChange={(event) => setPipelineForm((previous) => ({ ...previous, b_roll_prompts: event.target.value }))} style={{ marginTop: '0.35rem' }} />
          </label>
        </div>

        <div className="table-toolbar" style={{ marginTop: '0.9rem' }}>
          <div className="toolbar-group">
            <button className="tiny-button" type="button" disabled={Boolean(busyStep) || !pipelineReady.newsToScript} onClick={runNewsToScript}>Run News -&gt; Script</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep) || !pipelineReady.scriptToVoice} onClick={runScriptToVoice}>Run Script -&gt; Voice</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep) || !pipelineReady.voiceToAvatar} onClick={runVoiceToAvatar}>Run Voice -&gt; Avatar</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep) || !pipelineReady.assembly} onClick={runAssembly}>Run Assembly</button>
            <button className="tiny-button" type="button" disabled={Boolean(busyStep) || !pipelineReady.publish} onClick={runPublish}>Run Publish</button>
          </div>
        </div>

        {busyStep ? <p className="text-sm text-gray-500">Running: {busyStep}...</p> : null}
      </section>
    </div>
  );
};

export default Home;
