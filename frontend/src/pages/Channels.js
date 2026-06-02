// frontend/src/pages/Channels.js
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, apiPost } from '../lib/api';

const Channels = () => {
  const [channels, setChannels] = useState([]);
  const [avatars, setAvatars] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    avatar_id: '',
    name: '',
    script_style_preset: ''
  });
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const [channelData, avatarData, workspaceData] = await Promise.all([
          apiGet('/api/channels/'),
          apiGet('/api/avatars/'),
          apiGet('/api/workspaces/')
        ]);
        setChannels(channelData);
        setAvatars(avatarData);
        setWorkspaces(workspaceData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: workspaceData[0] ? String(workspaceData[0].id) : '',
          avatar_id: avatarData[0] ? String(avatarData[0].id) : ''
        }));
        setError('');
      } catch (error) {
        setError('Unable to load channels. Verify backend connectivity.');
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, []);

  const handleCreateChannel = () => {
    setCreating((previous) => !previous);
  };

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.avatar_id || !createForm.name.trim()) {
      setError('Workspace, avatar, and name are required.');
      return;
    }

    try {
      const payload = {
        workspace_id: Number(createForm.workspace_id),
        avatar_id: Number(createForm.avatar_id),
        name: createForm.name.trim(),
        script_style_preset: createForm.script_style_preset.trim() || null,
        is_active: true
      };

      const newChannel = await apiPost('/api/channels/', payload);
      setChannels((previous) => [newChannel, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        name: '',
        script_style_preset: ''
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create channel.');
    }
  };

  const handleDeleteChannel = async (channelId) => {
    if (!window.confirm('Delete this channel?')) {
      return;
    }

    try {
      await apiDelete(`/api/channels/${channelId}`);
      setChannels((previous) => previous.filter((channel) => channel.id !== channelId));
    } catch {
      setError('Failed to delete channel.');
    }
  };

  const resolveAvatarName = (avatarId) => {
    const avatar = avatars.find((item) => item.id === avatarId);
    return avatar ? avatar.name : 'N/A';
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Channels</h2>
        <button 
          onClick={handleCreateChannel}
          className="theme-toggle"
        >
          {creating ? 'Close Form' : 'Create Channel'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Channel</h3>
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
              Avatar
              <select
                value={createForm.avatar_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, avatar_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {avatars.map((avatar) => (
                  <option key={avatar.id} value={avatar.id}>
                    {avatar.name}
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
              Script Style
              <input
                value={createForm.script_style_preset}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, script_style_preset: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>

          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Channel
          </button>
        </form>
      ) : null}
      
      {channels.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No channels found. Create your first channel.</p>
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
                  Avatar
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Script Style
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {channels.map(channel => (
                <tr key={channel.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{channel.name}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{resolveAvatarName(channel.avatar_id)}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">{channel.script_style_preset || 'N/A'}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      channel.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {channel.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button 
                      onClick={() => navigate(`/channels`)}
                      className="text-indigo-600 hover:text-indigo-900"
                    >
                      Details
                    </button>
                    <button 
                      onClick={() => handleDeleteChannel(channel.id)}
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

export default Channels;