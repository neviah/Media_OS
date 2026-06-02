import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { archiveId, getArchivedIdSet, unarchiveId } from '../lib/archiveStore';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const ENTITY_KEY = 'scripts';
const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  channel_id: '',
  title: '',
  content: '',
  source_links: '',
  status: 'draft'
};

const Scripts = () => {
  const { success, error: showError, info } = useToast();

  const [scripts, setScripts] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [createForm, setCreateForm] = useState(defaultCreateForm);
  const [createErrors, setCreateErrors] = useState({});

  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [editErrors, setEditErrors] = useState({});

  const [searchText, setSearchText] = useState('');
  const [workspaceFilter, setWorkspaceFilter] = useState('all');
  const [channelFilter, setChannelFilter] = useState('all');
  const [sortKey, setSortKey] = useState('created_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => getArchivedIdSet(ENTITY_KEY));

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
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : ''),
          channel_id: previous.channel_id || (channelData[0] ? String(channelData[0].id) : '')
        }));
      } catch {
        showError('Unable to load scripts.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [showError]);

  const channelsForCreate = useMemo(() => {
    if (!createForm.workspace_id) {
      return channels;
    }
    return channels.filter((channel) => String(channel.workspace_id) === String(createForm.workspace_id));
  }, [channels, createForm.workspace_id]);

  useEffect(() => {
    if (channelsForCreate.length === 0) {
      return;
    }
    const exists = channelsForCreate.some((channel) => String(channel.id) === String(createForm.channel_id));
    if (!exists) {
      setCreateForm((previous) => ({ ...previous, channel_id: String(channelsForCreate[0].id) }));
    }
  }, [channelsForCreate, createForm.channel_id]);

  const filteredByArchive = useMemo(() => {
    const base = scripts.filter((script) => (showArchived ? archivedIds.has(script.id) : !archivedIds.has(script.id)));
    return base.filter((script) => {
      const workspaceMatches = workspaceFilter === 'all' || String(script.workspace_id) === workspaceFilter;
      const channelMatches = channelFilter === 'all' || String(script.channel_id) === channelFilter;
      return workspaceMatches && channelMatches;
    });
  }, [scripts, showArchived, archivedIds, workspaceFilter, channelFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredByArchive, searchText, ['title', 'content', 'status', 'source_links']),
    [filteredByArchive, searchText]
  );
  const sortedRows = useMemo(() => sortRows(searchedRows, sortKey, sortDirection), [searchedRows, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => paginateRows(sortedRows, page, PAGE_SIZE), [sortedRows, page]);

  useEffect(() => {
    setPage(1);
  }, [searchText, workspaceFilter, channelFilter, sortKey, sortDirection, showArchived]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const resetCreateErrors = () => setCreateErrors({});

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    const errors = validateRequired(createForm, ['workspace_id', 'channel_id', 'title', 'content']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill required script fields.');
      return;
    }

    try {
      const created = await apiPost('/api/scripts/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        title: createForm.title.trim(),
        content: createForm.content.trim(),
        source_links: createForm.source_links.trim() || null,
        status: createForm.status.trim() || 'draft'
      });
      setScripts((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...defaultCreateForm,
        workspace_id: previous.workspace_id,
        channel_id: previous.channel_id
      }));
      setCreating(false);
      resetCreateErrors();
      success('Script created.');
    } catch {
      showError('Failed to create script.');
    }
  };

  const startEdit = (script) => {
    setEditingId(script.id);
    setEditErrors({});
    setEditForm({
      title: script.title || '',
      content: script.content || '',
      source_links: script.source_links || '',
      status: script.status || 'draft'
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (scriptId) => {
    const errors = validateRequired(editForm, ['title', 'content']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Title and content are required.');
      return;
    }

    try {
      const updated = await apiPut(`/api/scripts/${scriptId}`, {
        title: editForm.title.trim(),
        content: editForm.content.trim(),
        source_links: editForm.source_links.trim() || null,
        status: editForm.status.trim() || 'draft'
      });
      setScripts((previous) => previous.map((item) => (item.id === scriptId ? updated : item)));
      cancelEdit();
      success('Script updated.');
    } catch {
      showError('Failed to update script.');
    }
  };

  const handleArchive = (scriptId) => {
    archiveId(ENTITY_KEY, scriptId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Script archived.');
  };

  const handleRestore = (scriptId) => {
    unarchiveId(ENTITY_KEY, scriptId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Script restored.');
  };

  const handleHardDelete = async (scriptId) => {
    if (!window.confirm('Permanently delete this script?')) {
      return;
    }

    try {
      await apiDelete(`/api/scripts/${scriptId}`);
      unarchiveId(ENTITY_KEY, scriptId);
      setArchivedIds(getArchivedIdSet(ENTITY_KEY));
      setScripts((previous) => previous.filter((item) => item.id !== scriptId));
      success('Script deleted permanently.');
    } catch {
      showError('Failed to delete script.');
    }
  };

  const toggleSelection = (scriptId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(scriptId)) {
        next.delete(scriptId);
      } else {
        next.add(scriptId);
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

  const handleBulkArchive = () => {
    selectedIds.forEach((id) => archiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected scripts archived.');
  };

  const handleBulkRestore = () => {
    selectedIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected scripts restored.');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected scripts?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/scripts/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    successIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setScripts((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} scripts.`);
    if (successIds.length !== ids.length) {
      showError('Some scripts failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('scripts-export.json', exportRows);
    success(`Exported ${exportRows.length} scripts.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          channel_id: Number(row.channel_id || createForm.channel_id),
          title: String(row.title || '').trim(),
          content: String(row.content || '').trim(),
          source_links: row.source_links ? String(row.source_links) : null,
          status: row.status ? String(row.status) : 'draft'
        };

        if (!payload.workspace_id || !payload.channel_id || !payload.title || !payload.content) {
          continue;
        }

        await apiPost('/api/scripts/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/scripts/');
      setScripts(refreshed);
      success(`Imported ${createdCount} scripts.`);
    } catch {
      showError('Import failed. Ensure file contains valid JSON array rows.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));
  const channelFilterOptions = workspaceFilter === 'all'
    ? channels
    : channels.filter((channel) => String(channel.workspace_id) === workspaceFilter);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Scripts</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Create Script'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Script</h3>
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
              Channel *
              <select
                value={createForm.channel_id}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, channel_id: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {channelsForCreate.map((channel) => (
                  <option key={channel.id} value={channel.id}>{channel.name}</option>
                ))}
              </select>
              {createErrors.channel_id ? <div className="field-error">Channel is required.</div> : null}
            </label>
            <label>
              Title *
              <input
                value={createForm.title}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, title: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
              {createErrors.title ? <div className="field-error">Title is required.</div> : null}
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
            <label>
              Source Links
              <input
                value={createForm.source_links}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, source_links: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <label style={{ marginTop: '0.8rem', display: 'block' }}>
            Content *
            <textarea
              rows={6}
              value={createForm.content}
              onChange={(event) => {
                setCreateForm((previous) => ({ ...previous, content: event.target.value }));
                resetCreateErrors();
              }}
              className="form-input"
              style={{ marginTop: '0.4rem' }}
            />
            {createErrors.content ? <div className="field-error">Content is required.</div> : null}
          </label>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Script
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
          <select className="form-input" style={{ width: '180px' }} value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
            <option value="all">All channels</option>
            {channelFilterOptions.map((channel) => (
              <option key={channel.id} value={channel.id}>{channel.name}</option>
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
          { value: 'title', label: 'Title' },
          { value: 'status', label: 'Status' }
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
          <p className="text-gray-500">No scripts to display.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Content</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Sources</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((script) => {
                  const isEditing = editingId === script.id;
                  return (
                    <tr key={script.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(script.id)} onChange={() => toggleSelection(script.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input
                              className="form-input"
                              value={editForm.title}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, title: event.target.value }))}
                            />
                            {editErrors.title ? <div className="field-error">Title is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{script.title}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <select
                            className="form-input"
                            value={editForm.status}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, status: event.target.value }))}
                          >
                            <option value="draft">draft</option>
                            <option value="reviewed">reviewed</option>
                            <option value="approved">approved</option>
                          </select>
                        ) : (
                          <div className="text-sm text-gray-500">{script.status}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <>
                            <textarea
                              rows={4}
                              className="form-input"
                              value={editForm.content}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, content: event.target.value }))}
                            />
                            {editErrors.content ? <div className="field-error">Content is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500 max-w-xs truncate">{script.content}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <input
                            className="form-input"
                            value={editForm.source_links}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, source_links: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500 max-w-xs truncate">{script.source_links || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(script.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(script)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {showArchived ? (
                              <button onClick={() => handleRestore(script.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button>
                            ) : (
                              <button onClick={() => handleArchive(script.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>
                            )}
                            <button onClick={() => handleHardDelete(script.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Scripts;
