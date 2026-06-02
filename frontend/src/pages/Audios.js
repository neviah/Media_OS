import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { archiveId, getArchivedIdSet, unarchiveId } from '../lib/archiveStore';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const ENTITY_KEY = 'audios';
const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  channel_id: '',
  script_id: '',
  file_path: '',
  voice_model: '',
  duration: '',
  status: 'generated'
};

const Audios = () => {
  const { success, error: showError, info } = useToast();

  const [audios, setAudios] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [scripts, setScripts] = useState([]);
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
        const [audioData, workspaceData, channelData, scriptData] = await Promise.all([
          apiGet('/api/audios/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/scripts/')
        ]);
        setAudios(audioData);
        setWorkspaces(workspaceData);
        setChannels(channelData);
        setScripts(scriptData);

        setCreateForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : ''),
          channel_id: previous.channel_id || (channelData[0] ? String(channelData[0].id) : ''),
          script_id: previous.script_id || (scriptData[0] ? String(scriptData[0].id) : '')
        }));
      } catch {
        showError('Unable to load audio items.');
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

  const scriptsForCreate = useMemo(() => {
    return scripts.filter((script) => {
      const workspaceMatches = !createForm.workspace_id || String(script.workspace_id) === String(createForm.workspace_id);
      const channelMatches = !createForm.channel_id || String(script.channel_id) === String(createForm.channel_id);
      return workspaceMatches && channelMatches;
    });
  }, [scripts, createForm.workspace_id, createForm.channel_id]);

  useEffect(() => {
    if (channelsForCreate.length > 0 && !channelsForCreate.some((item) => String(item.id) === String(createForm.channel_id))) {
      setCreateForm((previous) => ({ ...previous, channel_id: String(channelsForCreate[0].id) }));
    }
  }, [channelsForCreate, createForm.channel_id]);

  useEffect(() => {
    if (scriptsForCreate.length > 0 && !scriptsForCreate.some((item) => String(item.id) === String(createForm.script_id))) {
      setCreateForm((previous) => ({ ...previous, script_id: String(scriptsForCreate[0].id) }));
    }
  }, [scriptsForCreate, createForm.script_id]);

  const filteredByArchive = useMemo(() => {
    const base = audios.filter((audio) => (showArchived ? archivedIds.has(audio.id) : !archivedIds.has(audio.id)));
    return base.filter((audio) => {
      const workspaceMatches = workspaceFilter === 'all' || String(audio.workspace_id) === workspaceFilter;
      const channelMatches = channelFilter === 'all' || String(audio.channel_id) === channelFilter;
      return workspaceMatches && channelMatches;
    });
  }, [audios, showArchived, archivedIds, workspaceFilter, channelFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredByArchive, searchText, ['file_path', 'voice_model', 'status']),
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
    const errors = validateRequired(createForm, ['workspace_id', 'channel_id', 'script_id', 'file_path']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill required audio fields.');
      return;
    }

    try {
      const created = await apiPost('/api/audios/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        script_id: Number(createForm.script_id),
        file_path: createForm.file_path.trim(),
        voice_model: createForm.voice_model.trim() || null,
        duration: createForm.duration ? Number(createForm.duration) : null,
        status: createForm.status.trim() || 'generated'
      });
      setAudios((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...defaultCreateForm,
        workspace_id: previous.workspace_id,
        channel_id: previous.channel_id,
        script_id: previous.script_id
      }));
      setCreating(false);
      resetCreateErrors();
      success('Audio item created.');
    } catch {
      showError('Failed to create audio item.');
    }
  };

  const startEdit = (audio) => {
    setEditingId(audio.id);
    setEditErrors({});
    setEditForm({
      file_path: audio.file_path || '',
      voice_model: audio.voice_model || '',
      duration: audio.duration ?? '',
      status: audio.status || 'generated'
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (audioId) => {
    const errors = validateRequired(editForm, ['file_path', 'status']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('File path and status are required.');
      return;
    }

    try {
      const updated = await apiPut(`/api/audios/${audioId}`, {
        file_path: editForm.file_path.trim(),
        voice_model: editForm.voice_model.trim() || null,
        duration: editForm.duration === '' ? null : Number(editForm.duration),
        status: editForm.status.trim()
      });
      setAudios((previous) => previous.map((item) => (item.id === audioId ? updated : item)));
      cancelEdit();
      success('Audio updated.');
    } catch {
      showError('Failed to update audio item.');
    }
  };

  const handleArchive = (audioId) => {
    archiveId(ENTITY_KEY, audioId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Audio archived.');
  };

  const handleRestore = (audioId) => {
    unarchiveId(ENTITY_KEY, audioId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Audio restored.');
  };

  const handleHardDelete = async (audioId) => {
    if (!window.confirm('Permanently delete this audio item?')) {
      return;
    }

    try {
      await apiDelete(`/api/audios/${audioId}`);
      unarchiveId(ENTITY_KEY, audioId);
      setArchivedIds(getArchivedIdSet(ENTITY_KEY));
      setAudios((previous) => previous.filter((item) => item.id !== audioId));
      success('Audio deleted permanently.');
    } catch {
      showError('Failed to delete audio item.');
    }
  };

  const toggleSelection = (audioId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(audioId)) {
        next.delete(audioId);
      } else {
        next.add(audioId);
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
    info('Selected audios archived.');
  };

  const handleBulkRestore = () => {
    selectedIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected audios restored.');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected audio items?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/audios/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    successIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setAudios((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} audio items.`);
    if (successIds.length !== ids.length) {
      showError('Some selected audio items failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('audios-export.json', exportRows);
    success(`Exported ${exportRows.length} audio rows.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          channel_id: Number(row.channel_id || createForm.channel_id),
          script_id: Number(row.script_id || createForm.script_id),
          file_path: String(row.file_path || '').trim(),
          voice_model: row.voice_model ? String(row.voice_model) : null,
          duration: row.duration !== undefined && row.duration !== null ? Number(row.duration) : null,
          status: row.status ? String(row.status) : 'generated'
        };

        if (!payload.workspace_id || !payload.channel_id || !payload.script_id || !payload.file_path) {
          continue;
        }

        await apiPost('/api/audios/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/audios/');
      setAudios(refreshed);
      success(`Imported ${createdCount} audio rows.`);
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
        <h2 className="text-xl font-bold">Audio Files</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Audio'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Audio</h3>
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
              Script *
              <select
                value={createForm.script_id}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, script_id: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {scriptsForCreate.map((script) => (
                  <option key={script.id} value={script.id}>{script.title}</option>
                ))}
              </select>
              {createErrors.script_id ? <div className="field-error">Script is required.</div> : null}
            </label>
            <label>
              File Path *
              <input
                value={createForm.file_path}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, file_path: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
              {createErrors.file_path ? <div className="field-error">File path is required.</div> : null}
            </label>
            <label>
              Voice Model
              <input
                value={createForm.voice_model}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, voice_model: event.target.value }))}
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
            <label>
              Status *
              <input
                value={createForm.status}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, status: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Audio
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
          { value: 'status', label: 'Status' },
          { value: 'duration', label: 'Duration' }
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
          <p className="text-gray-500">No audio rows to display.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Script ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">File Path</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Voice Model</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((audio) => {
                  const isEditing = editingId === audio.id;
                  return (
                    <tr key={audio.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(audio.id)} onChange={() => toggleSelection(audio.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{audio.script_id}</div></td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <>
                            <input
                              className="form-input"
                              value={editForm.file_path}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, file_path: event.target.value }))}
                            />
                            {editErrors.file_path ? <div className="field-error">File path is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500 max-w-xs truncate">{audio.file_path}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            className="form-input"
                            value={editForm.voice_model}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, voice_model: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{audio.voice_model || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            className="form-input"
                            value={editForm.duration}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, duration: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{audio.duration ? `${audio.duration}s` : 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input
                              className="form-input"
                              value={editForm.status}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, status: event.target.value }))}
                            />
                            {editErrors.status ? <div className="field-error">Status is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500">{audio.status}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(audio.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(audio)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {showArchived ? (
                              <button onClick={() => handleRestore(audio.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button>
                            ) : (
                              <button onClick={() => handleArchive(audio.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>
                            )}
                            <button onClick={() => handleHardDelete(audio.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Audios;
