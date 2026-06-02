import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const PublishLogs = () => {
  const [publishLogs, setPublishLogs] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [videos, setVideos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    channel_id: '',
    video_id: '',
    platform: '',
    status: 'queued',
    platform_video_id: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [logData, workspaceData, channelData, videoData] = await Promise.all([
          apiGet('/api/publish-logs/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/videos/')
        ]);
        setPublishLogs(logData);
        setWorkspaces(workspaceData);
        setChannels(channelData);
        setVideos(videoData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: workspaceData.length > 0 ? String(workspaceData[0].id) : '',
          channel_id: channelData.length > 0 ? String(channelData[0].id) : '',
          video_id: videoData.length > 0 ? String(videoData[0].id) : ''
        }));
        setError('');
      } catch {
        setError('Unable to load publish logs.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.channel_id || !createForm.video_id || !createForm.platform.trim()) {
      setError('Workspace, channel, video, and platform are required.');
      return;
    }

    try {
      const created = await apiPost('/api/publish-logs/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        video_id: Number(createForm.video_id),
        platform: createForm.platform.trim(),
        status: createForm.status.trim() || 'queued',
        platform_video_id: createForm.platform_video_id.trim() || null
      });
      setPublishLogs((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        platform: '',
        status: 'queued',
        platform_video_id: ''
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create publish log.');
    }
  };

  const handleEditLog = async (log) => {
    const platform = window.prompt('Platform', log.platform || '');
    if (platform === null || !platform.trim()) {
      return;
    }
    const status = window.prompt('Status', log.status || 'queued');
    if (status === null || !status.trim()) {
      return;
    }
    const platformVideoId = window.prompt('Platform video ID', log.platform_video_id || '');
    if (platformVideoId === null) {
      return;
    }

    try {
      const updated = await apiPut(`/api/publish-logs/${log.id}`, {
        platform: platform.trim(),
        status: status.trim(),
        platform_video_id: platformVideoId.trim() || null
      });
      setPublishLogs((previous) => previous.map((item) => (item.id === log.id ? updated : item)));
      setError('');
    } catch {
      setError('Failed to update publish log.');
    }
  };

  const handleDeleteLog = async (logId) => {
    if (!window.confirm('Delete this publish log?')) {
      return;
    }

    try {
      await apiDelete(`/api/publish-logs/${logId}`);
      setPublishLogs((previous) => previous.filter((item) => item.id !== logId));
      setError('');
    } catch {
      setError('Failed to delete publish log.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Publish Logs</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Create Publish Log'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Publish Log</h3>
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
              Video
              <select
                value={createForm.video_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, video_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {videos.map((video) => (
                  <option key={video.id} value={video.id}>{`Video #${video.id}`}</option>
                ))}
              </select>
            </label>
            <label>
              Platform
              <input
                value={createForm.platform}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, platform: event.target.value }))}
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
            <label>
              Platform Video ID
              <input
                value={createForm.platform_video_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, platform_video_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Publish Log
          </button>
        </form>
      ) : null}

      {publishLogs.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No publish logs found. Create your first log.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Video ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform Video ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Published At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {publishLogs.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{log.video_id}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{log.platform}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{log.status}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{log.platform_video_id || 'N/A'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{log.published_at ? new Date(log.published_at).toLocaleString() : 'Not published'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEditLog(log)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                    <button onClick={() => handleDeleteLog(log.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default PublishLogs;
