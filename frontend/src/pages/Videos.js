import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const Videos = () => {
  const [videos, setVideos] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [audios, setAudios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    channel_id: '',
    audio_id: '',
    final_video_path: '',
    thumbnail_path: '',
    status: 'draft'
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [videoData, workspaceData, channelData, audioData] = await Promise.all([
          apiGet('/api/videos/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/audios/')
        ]);
        setVideos(videoData);
        setWorkspaces(workspaceData);
        setChannels(channelData);
        setAudios(audioData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: workspaceData.length > 0 ? String(workspaceData[0].id) : '',
          channel_id: channelData.length > 0 ? String(channelData[0].id) : '',
          audio_id: audioData.length > 0 ? String(audioData[0].id) : ''
        }));
        setError('');
      } catch {
        setError('Unable to load videos.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.channel_id || !createForm.audio_id || !createForm.final_video_path.trim()) {
      setError('Workspace, channel, audio, and final video path are required.');
      return;
    }

    try {
      const created = await apiPost('/api/videos/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        audio_id: Number(createForm.audio_id),
        final_video_path: createForm.final_video_path.trim(),
        thumbnail_path: createForm.thumbnail_path.trim() || null,
        status: createForm.status
      });
      setVideos((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        final_video_path: '',
        thumbnail_path: '',
        status: 'draft'
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create video.');
    }
  };

  const handleEditVideo = async (video) => {
    const finalVideoPath = window.prompt('Final video path', video.final_video_path || '');
    if (finalVideoPath === null || !finalVideoPath.trim()) {
      return;
    }
    const thumbnailPath = window.prompt('Thumbnail path', video.thumbnail_path || '');
    if (thumbnailPath === null) {
      return;
    }
    const status = window.prompt('Status', video.status || 'draft');
    if (status === null || !status.trim()) {
      return;
    }

    try {
      const updated = await apiPut(`/api/videos/${video.id}`, {
        final_video_path: finalVideoPath.trim(),
        thumbnail_path: thumbnailPath.trim() || null,
        status: status.trim()
      });
      setVideos((previous) => previous.map((item) => (item.id === video.id ? updated : item)));
      setError('');
    } catch {
      setError('Failed to update video.');
    }
  };

  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('Delete this video?')) {
      return;
    }

    try {
      await apiDelete(`/api/videos/${videoId}`);
      setVideos((previous) => previous.filter((item) => item.id !== videoId));
      setError('');
    } catch {
      setError('Failed to delete video.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Videos</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Video'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Video</h3>
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
              Audio
              <select
                value={createForm.audio_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, audio_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {audios.map((audio) => (
                  <option key={audio.id} value={audio.id}>{`Audio #${audio.id}`}</option>
                ))}
              </select>
            </label>
            <label>
              Final Video Path
              <input
                value={createForm.final_video_path}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, final_video_path: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Thumbnail Path
              <input
                value={createForm.thumbnail_path}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, thumbnail_path: event.target.value }))}
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
            Save Video
          </button>
        </form>
      ) : null}

      {videos.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No videos found. Add your first video.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audio ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Video Path</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thumbnail Path</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {videos.map((video) => (
                <tr key={video.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{video.audio_id}</div></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-500 max-w-xs truncate">{video.final_video_path}</div></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-500 max-w-xs truncate">{video.thumbnail_path || 'N/A'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{video.status}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{new Date(video.created_at).toLocaleString()}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEditVideo(video)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                    <button onClick={() => handleDeleteVideo(video.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Videos;
