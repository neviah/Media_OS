import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const Metrics = () => {
  const [metrics, setMetrics] = useState([]);
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
    views: '',
    likes: '',
    comments: '',
    shares: '',
    watch_time: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [metricData, workspaceData, channelData, videoData] = await Promise.all([
          apiGet('/api/metrics/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/videos/')
        ]);
        setMetrics(metricData);
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
        setError('Unable to load metrics.');
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
      const created = await apiPost('/api/metrics/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        video_id: Number(createForm.video_id),
        platform: createForm.platform.trim(),
        views: createForm.views ? Number(createForm.views) : 0,
        likes: createForm.likes ? Number(createForm.likes) : 0,
        comments: createForm.comments ? Number(createForm.comments) : 0,
        shares: createForm.shares ? Number(createForm.shares) : 0,
        watch_time: createForm.watch_time ? Number(createForm.watch_time) : null
      });
      setMetrics((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        platform: '',
        views: '',
        likes: '',
        comments: '',
        shares: '',
        watch_time: ''
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create metric.');
    }
  };

  const handleEditMetric = async (metric) => {
    const platform = window.prompt('Platform', metric.platform || '');
    if (platform === null || !platform.trim()) {
      return;
    }
    const views = window.prompt('Views', String(metric.views ?? 0));
    if (views === null) {
      return;
    }
    const likes = window.prompt('Likes', String(metric.likes ?? 0));
    if (likes === null) {
      return;
    }

    try {
      const updated = await apiPut(`/api/metrics/${metric.id}`, {
        platform: platform.trim(),
        views: Number(views) || 0,
        likes: Number(likes) || 0
      });
      setMetrics((previous) => previous.map((item) => (item.id === metric.id ? updated : item)));
      setError('');
    } catch {
      setError('Failed to update metric.');
    }
  };

  const handleDeleteMetric = async (metricId) => {
    if (!window.confirm('Delete this metric?')) {
      return;
    }

    try {
      await apiDelete(`/api/metrics/${metricId}`);
      setMetrics((previous) => previous.filter((item) => item.id !== metricId));
      setError('');
    } catch {
      setError('Failed to delete metric.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Metrics</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Metric'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Metric</h3>
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
              Views
              <input
                type="number"
                min="0"
                value={createForm.views}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, views: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Likes
              <input
                type="number"
                min="0"
                value={createForm.likes}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, likes: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Comments
              <input
                type="number"
                min="0"
                value={createForm.comments}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, comments: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Shares
              <input
                type="number"
                min="0"
                value={createForm.shares}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, shares: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Watch Time (seconds)
              <input
                type="number"
                min="0"
                value={createForm.watch_time}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, watch_time: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Metric
          </button>
        </form>
      ) : null}

      {metrics.length === 0 ? (
        <div className="text-center py-10"><p className="text-gray-500">No metrics found. Add your first metric.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Video ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Views</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Likes</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Watch Time</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Recorded At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics.map((metric) => (
                <tr key={metric.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.video_id}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.platform}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.views}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.likes}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.comments}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.shares}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.watch_time || 'N/A'} sec</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{new Date(metric.recorded_at).toLocaleString()}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEditMetric(metric)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                    <button onClick={() => handleDeleteMetric(metric.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Metrics;
