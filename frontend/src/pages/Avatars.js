// frontend/src/pages/Avatars.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const Avatars = () => {
  const [avatars, setAvatars] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    name: '',
    style_hints: '',
    channel_type: ''
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const [avatarData, workspaceData] = await Promise.all([
          apiGet('/api/avatars/'),
          apiGet('/api/workspaces/')
        ]);
        setAvatars(avatarData);
        setWorkspaces(workspaceData);
        if (workspaceData.length > 0) {
          setCreateForm((previous) => ({
            ...previous,
            workspace_id: String(workspaceData[0].id)
          }));
        }
        setError('');
      } catch (error) {
        setError('Unable to load avatars. Verify the backend is running on port 8000.');
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, []);

  const handleCreateAvatar = () => {
    setCreating((previous) => !previous);
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.name.trim()) {
      setError('Workspace and name are required.');
      return;
    }

    try {
      const payload = {
        workspace_id: Number(createForm.workspace_id),
        name: createForm.name.trim(),
        style_hints: createForm.style_hints.trim() || null,
        channel_type: createForm.channel_type.trim() || null
      };
      const newAvatar = await apiPost('/api/avatars/', payload);
      setAvatars((previous) => [newAvatar, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        name: '',
        style_hints: '',
        channel_type: ''
      }));
      setCreating(false);
      setError('');
    } catch (submitError) {
      setError('Failed to create avatar. Check required fields and try again.');
    }
  };

  const handleDeleteAvatar = async (avatarId) => {
    if (!window.confirm('Delete this avatar?')) {
      return;
    }

    try {
      await apiDelete(`/api/avatars/${avatarId}`);
      setAvatars((previous) => previous.filter((avatar) => avatar.id !== avatarId));
      setError('');
    } catch {
      setError('Failed to delete avatar.');
    }
  };

  const handleEditAvatar = async (avatar) => {
    const name = window.prompt('Avatar name', avatar.name || '');
    if (name === null || !name.trim()) {
      return;
    }

    const styleHints = window.prompt('Style hints', avatar.style_hints || '');
    if (styleHints === null) {
      return;
    }

    const channelType = window.prompt('Channel type', avatar.channel_type || '');
    if (channelType === null) {
      return;
    }

    try {
      const updatedAvatar = await apiPut(`/api/avatars/${avatar.id}`, {
        name: name.trim(),
        style_hints: styleHints.trim() || null,
        channel_type: channelType.trim() || null
      });
      setAvatars((previous) => previous.map((item) => (item.id === avatar.id ? updatedAvatar : item)));
      setError('');
    } catch {
      setError('Failed to update avatar.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Avatars</h2>
        <button 
          onClick={handleCreateAvatar}
          className="theme-toggle"
        >
          {creating ? 'Close Form' : 'Create Avatar'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Avatar</h3>
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
              Name
              <input
                value={createForm.name}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Style Hints
              <input
                value={createForm.style_hints}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, style_hints: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Channel Type
              <input
                value={createForm.channel_type}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, channel_type: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>

          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Avatar
          </button>
        </form>
      ) : null}
      
      {avatars.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No avatars found. Create your first avatar.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Style Hints
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Channel Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {avatars.map(avatar => (
                <tr key={avatar.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{avatar.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{avatar.style_hints || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{avatar.channel_type || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => navigate(`/avatars/${avatar.id}`)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      View
                    </button>
                    <button 
                      onClick={() => handleEditAvatar(avatar)}
                      className="ml-4 text-yellow-600 hover:text-yellow-900"
                    >
                      Edit
                    </button>
                    <button 
                      onClick={() => handleDeleteAvatar(avatar.id)}
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

export default Avatars;