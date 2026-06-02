import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const MusicLibrary = () => {
  const [music, setMusic] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    title: '',
    file_path: '',
    tags: '',
    mood: '',
    duration: '',
    is_approved: false
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [musicData, workspaceData] = await Promise.all([
          apiGet('/api/music/'),
          apiGet('/api/workspaces/')
        ]);
        setMusic(musicData);
        setWorkspaces(workspaceData);
        if (workspaceData.length > 0) {
          setCreateForm((previous) => ({
            ...previous,
            workspace_id: String(workspaceData[0].id)
          }));
        }
        setError('');
      } catch {
        setError('Unable to load music tracks.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.title.trim() || !createForm.file_path.trim()) {
      setError('Workspace, title, and file path are required.');
      return;
    }

    try {
      const payload = {
        workspace_id: Number(createForm.workspace_id),
        title: createForm.title.trim(),
        file_path: createForm.file_path.trim(),
        tags: createForm.tags.trim() || null,
        mood: createForm.mood.trim() || null,
        duration: createForm.duration ? Number(createForm.duration) : null,
        is_approved: createForm.is_approved
      };
      const createdTrack = await apiPost('/api/music/', payload);
      setMusic((previous) => [createdTrack, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        title: '',
        file_path: '',
        tags: '',
        mood: '',
        duration: '',
        is_approved: false
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create music track.');
    }
  };

  const handleEditTrack = async (track) => {
    const title = window.prompt('Track title', track.title || '');
    if (title === null || !title.trim()) {
      return;
    }
    const mood = window.prompt('Mood', track.mood || '');
    if (mood === null) {
      return;
    }
    const tags = window.prompt('Tags', track.tags || '');
    if (tags === null) {
      return;
    }

    try {
      const updated = await apiPut(`/api/music/${track.id}`, {
        title: title.trim(),
        mood: mood.trim() || null,
        tags: tags.trim() || null
      });
      setMusic((previous) => previous.map((item) => (item.id === track.id ? updated : item)));
      setError('');
    } catch {
      setError('Failed to update track.');
    }
  };

  const handleDeleteTrack = async (trackId) => {
    if (!window.confirm('Delete this track?')) {
      return;
    }
    try {
      await apiDelete(`/api/music/${trackId}`);
      setMusic((previous) => previous.filter((item) => item.id !== trackId));
      setError('');
    } catch {
      setError('Failed to delete track.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Music Library</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Music'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Music Track</h3>
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
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Title
              <input
                value={createForm.title}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, title: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
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
              Tags
              <input
                value={createForm.tags}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, tags: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Mood
              <input
                value={createForm.mood}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, mood: event.target.value }))}
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
          </div>
          <label style={{ display: 'inline-flex', gap: '0.45rem', marginTop: '0.9rem' }}>
            <input
              type="checkbox"
              checked={createForm.is_approved}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, is_approved: event.target.checked }))}
            />
            Approved
          </label>
          <div>
            <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
              Save Track
            </button>
          </div>
        </form>
      ) : null}

      {music.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No music tracks found. Add your first track.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mood</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {music.map((track) => (
                <tr key={track.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{track.title}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{track.tags || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{track.mood || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{track.duration ? `${track.duration}s` : 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      track.is_approved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {track.is_approved ? 'Approved' : 'Pending'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEditTrack(track)} className="text-yellow-600 hover:text-yellow-900">
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteTrack(track.id)}
                      className="ml-4 text-red-600 hover:text-red-900"
                    >
                      Delete
                    </button>
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

export default MusicLibrary;
