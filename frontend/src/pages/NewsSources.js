import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  name: '',
  source_url: '',
  keywords: '',
  pull_interval: ''
};

const NewsSources = () => {
  const { success, error: showError, info } = useToast();

  const [newsSources, setNewsSources] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [createErrors, setCreateErrors] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editErrors, setEditErrors] = useState({});

  const [searchText, setSearchText] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    const loadData = async () => {
      try {
        const [sourceData, workspaceData] = await Promise.all([apiGet('/api/news-sources/'), apiGet('/api/workspaces/')]);
        setNewsSources(sourceData);
        setWorkspaces(workspaceData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : '')
        }));
      } catch {
        showError('Unable to load news sources.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [showError]);

  const archiveFiltered = useMemo(() => {
    const base = newsSources.filter((source) => (showArchived ? !source.is_active : source.is_active));
    if (workspaceFilter === 'all') {
      return base;
    }
    return base.filter((source) => String(source.workspace_id) === workspaceFilter);
  }, [newsSources, showArchived, workspaceFilter]);

  const searchedRows = useMemo(
    () => filterRows(archiveFiltered, searchText, ['name', 'source_url', 'keywords']),
    [archiveFiltered, searchText]
  );
  const sortedRows = useMemo(() => sortRows(searchedRows, sortKey, sortDirection), [searchedRows, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => paginateRows(sortedRows, page, PAGE_SIZE), [sortedRows, page]);

  useEffect(() => {
    setPage(1);
  }, [searchText, workspaceFilter, sortKey, sortDirection, showArchived]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const resetCreateErrors = () => setCreateErrors({});

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    const errors = validateRequired(createForm, ['workspace_id', 'name', 'source_url']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill required fields before creating.');
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
      setCreateForm((previous) => ({ ...defaultCreateForm, workspace_id: previous.workspace_id }));
      setCreating(false);
      resetCreateErrors();
      success('News source created.');
    } catch {
      showError('Failed to create news source.');
    }
  };

  const startEdit = (source) => {
    setEditingId(source.id);
    setEditErrors({});
    setEditForm({
      name: source.name || '',
      source_url: source.source_url || '',
      keywords: source.keywords || '',
      pull_interval: source.pull_interval ?? ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (sourceId) => {
    const errors = validateRequired(editForm, ['name', 'source_url']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Name and source URL are required.');
      return;
    }

    try {
      const updated = await apiPut(`/api/news-sources/${sourceId}`, {
        name: editForm.name.trim(),
        source_url: editForm.source_url.trim(),
        keywords: editForm.keywords.trim() || null,
        pull_interval: editForm.pull_interval === '' ? null : Number(editForm.pull_interval)
      });
      setNewsSources((previous) => previous.map((item) => (item.id === sourceId ? updated : item)));
      cancelEdit();
      success('News source updated.');
    } catch {
      showError('Failed to update news source.');
    }
  };

  const setActiveState = async (sourceId, nextActive) => {
    try {
      const updated = await apiPut(`/api/news-sources/${sourceId}`, { is_active: nextActive });
      setNewsSources((previous) => previous.map((item) => (item.id === sourceId ? updated : item)));
      info(nextActive ? 'News source restored.' : 'News source archived.');
    } catch {
      showError('Failed to update archive state.');
    }
  };

  const handleHardDelete = async (sourceId) => {
    if (!window.confirm('Permanently delete this source?')) {
      return;
    }

    try {
      await apiDelete(`/api/news-sources/${sourceId}`);
      setNewsSources((previous) => previous.filter((item) => item.id !== sourceId));
      success('Source deleted permanently.');
    } catch {
      showError('Failed to delete source.');
    }
  };

  const toggleSelection = (sourceId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  };

  const toggleSelectPage = (checked) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      pageRows.forEach((row) => {
        if (checked) {
          next.add(row.id);
        } else {
          next.delete(row.id);
        }
      });
      return next;
    });
  };

  const handleBulkArchive = async () => {
    if (selectedIds.size === 0) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiPut(`/api/news-sources/${id}`, { is_active: false })));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    setNewsSources((previous) =>
      previous.map((item) => (successIds.includes(item.id) ? { ...item, is_active: false } : item))
    );
    setSelectedIds(new Set());
    info(`Archived ${successIds.length} sources.`);
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiPut(`/api/news-sources/${id}`, { is_active: true })));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    setNewsSources((previous) =>
      previous.map((item) => (successIds.includes(item.id) ? { ...item, is_active: true } : item))
    );
    setSelectedIds(new Set());
    info(`Restored ${successIds.length} sources.`);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected sources?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/news-sources/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    setNewsSources((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} sources.`);
    if (successIds.length !== ids.length) {
      showError('Some selected sources could not be deleted.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('news-sources-export.json', exportRows);
    success(`Exported ${exportRows.length} sources.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          name: String(row.name || '').trim(),
          source_url: String(row.source_url || '').trim(),
          keywords: row.keywords ? String(row.keywords) : null,
          pull_interval: row.pull_interval !== undefined && row.pull_interval !== null ? Number(row.pull_interval) : null,
          is_active: row.is_active !== undefined ? Boolean(row.is_active) : true
        };

        if (!payload.workspace_id || !payload.name || !payload.source_url) {
          continue;
        }

        await apiPost('/api/news-sources/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/news-sources/');
      setNewsSources(refreshed);
      success(`Imported ${createdCount} sources.`);
    } catch {
      showError('Import failed. Ensure the file contains valid JSON array data.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">News Sources</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add News Source'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add News Source</h3>
          <div className="stage-list" style={{ marginTop: '0.9rem' }}>
            <label>
              Workspace *
              <select
                value={createForm.workspace_id}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, workspace_id: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {workspaces.map((workspace) => (
                  <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                ))}
              </select>
              {createErrors.workspace_id ? <div className="field-error">Workspace is required.</div> : null}
            </label>
            <label>
              Name *
              <input
                value={createForm.name}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, name: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
              {createErrors.name ? <div className="field-error">Name is required.</div> : null}
            </label>
            <label>
              Source URL *
              <input
                value={createForm.source_url}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, source_url: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
              {createErrors.source_url ? <div className="field-error">URL is required.</div> : null}
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

      <div className="table-toolbar">
        <div className="toolbar-group">
          <select className="form-input" style={{ width: '180px' }} value={workspaceFilter} onChange={(event) => setWorkspaceFilter(event.target.value)}>
            <option value="all">All workspaces</option>
            {workspaces.map((workspace) => (
              <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
            ))}
          </select>
        </div>
      </div>

      <EntityTableToolbar
        searchText={searchText}
        onSearchChange={setSearchText}
        sortKey={sortKey}
        onSortKeyChange={setSortKey}
        sortDirection={sortDirection}
        onSortDirectionChange={() => setSortDirection((previous) => (previous === 'asc' ? 'desc' : 'asc'))}
        sortOptions={[
          { value: 'created_at', label: 'Created' },
          { value: 'name', label: 'Name' },
          { value: 'pull_interval', label: 'Pull Interval' },
          { value: 'last_pulled', label: 'Last Pulled' }
        ]}
        showArchived={showArchived}
        onShowArchivedChange={setShowArchived}
        selectedCount={selectedIds.size}
        onArchiveSelected={handleBulkArchive}
        onUnarchiveSelected={handleBulkRestore}
        onDeleteSelected={handleBulkDelete}
        onExport={handleExport}
        onImport={handleImport}
      />

      {sortedRows.length === 0 ? (
        <div className="text-center py-10">
          <p className="text-gray-500">No news sources to display.</p>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input type="checkbox" checked={allPageSelected} onChange={(event) => toggleSelectPage(event.target.checked)} />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Source URL</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Keywords</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pull Interval</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Pulled</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((source) => {
                  const isEditing = editingId === source.id;
                  return (
                    <tr key={source.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(source.id)} onChange={() => toggleSelection(source.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input
                              className="form-input"
                              value={editForm.name}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))}
                            />
                            {editErrors.name ? <div className="field-error">Name is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{source.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <>
                            <input
                              className="form-input"
                              value={editForm.source_url}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, source_url: event.target.value }))}
                            />
                            {editErrors.source_url ? <div className="field-error">URL is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500 max-w-xs truncate">{source.source_url}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            className="form-input"
                            value={editForm.keywords}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, keywords: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{source.keywords || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="1"
                            className="form-input"
                            value={editForm.pull_interval}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, pull_interval: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{source.pull_interval || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-500">{source.last_pulled ? new Date(source.last_pulled).toLocaleString() : 'Never'}</div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(source.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(source)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {source.is_active ? (
                              <button onClick={() => setActiveState(source.id, false)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>
                            ) : (
                              <button onClick={() => setActiveState(source.id, true)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button>
                            )}
                            <button onClick={() => handleHardDelete(source.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="pager">
            <button className="tiny-button" type="button" onClick={() => setPage((previous) => Math.max(1, previous - 1))}>Prev</button>
            <span>{page} / {pageCount}</span>
            <button className="tiny-button" type="button" onClick={() => setPage((previous) => Math.min(pageCount, previous + 1))}>Next</button>
          </div>
        </>
      )}
    </div>
  );
};

export default NewsSources;
