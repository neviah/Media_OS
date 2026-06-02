import React, { useEffect, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';

const NewsSources = () => {
  const [newsSources, setNewsSources] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [createForm, setCreateForm] = useState({
    workspace_id: '',
    name: '',
    source_url: '',
    keywords: '',
    pull_interval: ''
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sourceData, workspaceData] = await Promise.all([
          apiGet('/api/news-sources/'),
          apiGet('/api/workspaces/')
        ]);
        setNewsSources(sourceData);
        setWorkspaces(workspaceData);
        if (workspaceData.length > 0) {
          setCreateForm((previous) => ({ ...previous, workspace_id: String(workspaceData[0].id) }));
        }
        setError('');
      } catch {
        setError('Unable to load news sources.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    if (!createForm.workspace_id || !createForm.name.trim() || !createForm.source_url.trim()) {
      setError('Workspace, name, and source URL are required.');
      return;
    }

    try {
      const created = await apiPost('/api/news-sources/', {
        workspace_id: Number(createForm.workspace_id),
        name: createForm.name.trim(),
        source_url: createForm.source_url.trim(),
        keywords: createForm.keywords.trim() || null,
        pull_interval: createForm.pull_interval ? Number(createForm.pull_interval) : null,
        is_active: true
      });
      setNewsSources((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...previous,
        name: '',
        source_url: '',
        keywords: '',
        pull_interval: ''
      }));
      setCreating(false);
      setError('');
    } catch {
      setError('Failed to create news source.');
    }
  };

  const handleEditSource = async (source) => {
    const name = window.prompt('Source name', source.name || '');
    if (name === null || !name.trim()) {
      return;
    }
    const sourceUrl = window.prompt('Source URL', source.source_url || '');
    if (sourceUrl === null || !sourceUrl.trim()) {
      return;
    }
    const keywords = window.prompt('Keywords', source.keywords || '');
    if (keywords === null) {
      return;
    }

    try {
      const updated = await apiPut(`/api/news-sources/${source.id}`, {
        name: name.trim(),
        source_url: sourceUrl.trim(),
        keywords: keywords.trim() || null
      });
      setNewsSources((previous) => previous.map((item) => (item.id === source.id ? updated : item)));
      setError('');
    } catch {
      setError('Failed to update news source.');
    }
  };

  const handleDeleteSource = async (sourceId) => {
    if (!window.confirm('Delete this news source?')) {
      return;
    }

    try {
      await apiDelete(`/api/news-sources/${sourceId}`);
      setNewsSources((previous) => previous.filter((item) => item.id !== sourceId));
      setError('');
    } catch {
      setError('Failed to delete news source.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">News Sources</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add News Source'}
        </button>
      </div>

      {error ? <p className="text-sm" style={{ color: '#b54747' }}>{error}</p> : null}

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add News Source</h3>
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
              Source URL
              <input
                value={createForm.source_url}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, source_url: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Keywords
              <input
                value={createForm.keywords}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, keywords: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Pull Interval (minutes)
              <input
                type="number"
                min="1"
                value={createForm.pull_interval}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, pull_interval: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Source
          </button>
        </form>
      ) : null}

      {newsSources.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No news sources found. Add your first source.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source URL</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keywords</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pull Interval (min)</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Pulled</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {newsSources.map((source) => (
                <tr key={source.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-gray-900">{source.name}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500 break-all">{source.source_url}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{source.keywords || 'N/A'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{source.pull_interval || 'N/A'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{source.last_pulled ? new Date(source.last_pulled).toLocaleString() : 'Never'}</div></td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      source.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {source.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <button onClick={() => handleEditSource(source)} className="text-yellow-600 hover:text-yellow-900">
                      Edit
                    </button>
                    <button onClick={() => handleDeleteSource(source.id)} className="ml-4 text-red-600 hover:text-red-900">
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

export default NewsSources;
