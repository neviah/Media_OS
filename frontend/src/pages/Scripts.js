import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const Scripts = () => {
  const [scripts, setScripts] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    channel_id: '',
    title: '',
    content: '',
    source_links: '',
    status: 'draft'
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [scriptData, workspaceData, channelData] = await Promise.all([
          apiGet('/api/scripts/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/')
        ]);
        setScripts(scriptData);
        setWorkspaces(workspaceData);
        setChannels(channelData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: workspaceData.length > 0 ? String(workspaceData[0].id) : '',
          channel_id: channelData.length > 0 ? String(channelData[0].id) : ''
        }));
        setError('');
      } catch {
        setError('Unable to load scripts.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.channel_id || !createForm.title.trim() || !createForm.content.trim()) {
      setError('Workspace, channel, title, and content are required.');
      return;
    }

    try {
      const created = await apiPost('/api/scripts/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        title: createForm.title.trim(),
        content: createForm.content.trim(),
        source_links: createForm.source_links.trim() || null,
        status: createForm.status
      });
      setScripts((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        title: '',
        content: '',
        source_links: '',
        status: 'draft'
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create script.');
    }
  };

  const handleEditScript = async (script) => {
    const title = window.prompt('Script title', script.title || '');
    if (title === null || !title.trim()) {
      return;
    }

    const content = window.prompt('Script content', script.content || '');
    if (content === null || !content.trim()) {
      return;
    }

    const status = window.prompt('Status (draft/reviewed/approved)', script.status || 'draft');
    if (status === null || !status.trim()) {
      return;
    }

    try {
      const updated = await apiPut(`/api/scripts/${script.id}`, {
        title: title.trim(),
        content: content.trim(),
        status: status.trim()
      });
      setScripts((previous) => previous.map((item) => (item.id === script.id ? updated : item)));
      setError('');
    } catch {
      setError('Failed to update script.');
    }
  };

  const handleDeleteScript = async (scriptId) => {
    if (!window.confirm('Delete this script?')) {
      return;
    }

    try {
      await apiDelete(`/api/scripts/${scriptId}`);
      setScripts((previous) => previous.filter((item) => item.id !== scriptId));
      setError('');
    } catch {
      setError('Failed to delete script.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Scripts</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Create Script'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Script</h3>
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
              Title
              <input
                value={createForm.title}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, title: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Source Links
              <input
                value={createForm.source_links}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, source_links: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Status
              <select
                value={createForm.status}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, status: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                <option value="draft">draft</option>
                <option value="reviewed">reviewed</option>
                <option value="approved">approved</option>
              </select>
            </label>
          </div>
          <label style={{ marginTop: '0.8rem', display: 'block' }}>
            Content
            <textarea
              rows={6}
              value={createForm.content}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, content: event.target.value }))}
              className="form-input"
              style={{ marginTop: '0.4rem' }}
            />
          </label>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Script
          </button>
        </form>
      ) : null}

      {scripts.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No scripts found. Create your first script.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content Preview</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sources</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created At</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {scripts.map((script) => (
                <tr key={script.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900">{script.title}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{script.status}</div></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-500 max-w-xs truncate">{script.content}</div></td>
                  <td className="px-6 py-4"><div className="text-sm text-gray-500 max-w-xs truncate">{script.source_links || 'N/A'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{new Date(script.created_at).toLocaleString()}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEditScript(script)} className="text-yellow-600 hover:text-yellow-900">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteScript(script.id)} className="ml-4 text-red-600 hover:text-red-900">
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

export default Scripts;
