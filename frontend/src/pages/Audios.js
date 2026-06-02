import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const Audios = () => {
  const [audios, setAudios] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [scripts, setScripts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    channel_id: '',
    script_id: '',
    file_path: '',
    voice_model: '',
    duration: '',
    status: 'generated'
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [audioData, workspaceData, channelData, scriptData] = await Promise.all([
          apiGet('/api/audios/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/scripts/')
        ]);
        setAudios(audioData);
        setWorkspaces(workspaceData);
        setChannels(channelData);
        setScripts(scriptData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: workspaceData.length > 0 ? String(workspaceData[0].id) : '',
          channel_id: channelData.length > 0 ? String(channelData[0].id) : '',
          script_id: scriptData.length > 0 ? String(scriptData[0].id) : ''
        }));
        setError('');
      } catch {
        setError('Unable to load audio items.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.channel_id || !createForm.script_id || !createForm.file_path.trim()) {
      setError('Workspace, channel, script, and file path are required.');
      return;
    }

    try {
      const created = await apiPost('/api/audios/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        script_id: Number(createForm.script_id),
        file_path: createForm.file_path.trim(),
        voice_model: createForm.voice_model.trim() || null,
        duration: createForm.duration ? Number(createForm.duration) : null,
        status: createForm.status
      });
      setAudios((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        file_path: '',
        voice_model: '',
        duration: '',
        status: 'generated'
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create audio item.');
    }
  };

  const handleEditAudio = async (audio) => {
    const filePath = window.prompt('Audio file path', audio.file_path || '');
    if (filePath === null || !filePath.trim()) {
      return;
    }
    const voiceModel = window.prompt('Voice model', audio.voice_model || '');
    if (voiceModel === null) {
      return;
    }
    const status = window.prompt('Status', audio.status || 'generated');
    if (status === null || !status.trim()) {
      return;
    }

    try {
      const updated = await apiPut(`/api/audios/${audio.id}`, {
        file_path: filePath.trim(),
        voice_model: voiceModel.trim() || null,
        status: status.trim()
      });
      setAudios((previous) => previous.map((item) => (item.id === audio.id ? updated : item)));
      setError('');
    } catch {
      setError('Failed to update audio item.');
    }
  };

  const handleDeleteAudio = async (audioId) => {
    if (!window.confirm('Delete this audio item?')) {
      return;
    }

    try {
      await apiDelete(`/api/audios/${audioId}`);
      setAudios((previous) => previous.filter((item) => item.id !== audioId));
      setError('');
    } catch {
      setError('Failed to delete audio item.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Audio Files</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Audio'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Audio</h3>
          <div className="stage-list" style={{ marginTop: '0.9rem' }}>
            <label>
              Workspace
              <select
                value={createForm.workspace_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, workspace_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
            </label>
            <label>
              Channel
              <select
                value={createForm.channel_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, channel_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name}</option>
                ))}
              </select>
            </label>
            <label>
              Script
              <select
                value={createForm.script_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, script_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {scripts.map((script) => (
                  <option key={script.id} value={script.id}>{script.title}</option>
                ))}
              </select>
            </label>
            <label>
              File Path
              <input
                value={createForm.file_path}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, file_path: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Voice Model
              <input
                value={createForm.voice_model}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, voice_model: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Duration (seconds)
              <input
                type="number"
                min="0"
                step="0.1"
                value={createForm.duration}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, duration: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Status
              <input
                value={createForm.status}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, status: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Audio
          </button>
        </form>
      ) : null}

      {audios.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No audio files found. Add your first audio file.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Script ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Path</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voice Model</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {audios.map((audio) => (
                <tr key={audio.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{audio.script_id}</div></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-500 max-w-xs truncate">{audio.file_path}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{audio.voice_model || 'N/A'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{audio.duration ? `${audio.duration}s` : 'N/A'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{audio.status}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{new Date(audio.created_at).toLocaleString()}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEditAudio(audio)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                    <button onClick={() => handleDeleteAudio(audio.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Audios;
