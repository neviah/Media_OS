import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { archiveId, getArchivedIdSet, unarchiveId } from '../lib/archiveStore';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const ENTITY_KEY = 'music';
const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  title: '',
  file_path: '',
  tags: '',
  mood: '',
  duration: '',
  is_approved: false
};

const MusicLibrary = () => {
  const { success, error: showError, info } = useToast();

  const [music, setMusic] = useState([]);
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

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => getArchivedIdSet(ENTITY_KEY));

  useEffect(() => {
    const loadData = async () => {
      try {
        const [musicData, workspaceData] = await Promise.all([apiGet('/api/music/'), apiGet('/api/workspaces/')]);
        setMusic(musicData);
        setWorkspaces(workspaceData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : '')
        }));
      } catch {
        showError('Unable to load music tracks.');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [showError]);

  const filteredByArchive = useMemo(() => {
    const base = music.filter((item) => (showArchived ? archivedIds.has(item.id) : !archivedIds.has(item.id)));
    if (workspaceFilter === 'all') {
      return base;
    }
    return base.filter((item) => String(item.workspace_id) === workspaceFilter);
  }, [music, showArchived, archivedIds, workspaceFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredByArchive, searchText, ['title', 'tags', 'mood', 'file_path']),
    [filteredByArchive, searchText]
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
    const errors = validateRequired(createForm, ['workspace_id', 'title', 'file_path']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill all required music fields.');
      return;
    }

    try {
      const payload = {
        workspace_id: Number(createForm.workspace_id),
        title: createForm.title.trim(),
        file_path: createForm.file_path.trim(),
        tags: createForm.tags.trim() || null,
        mood: createForm.mood.trim() || null,
        duration: createForm.duration ? Number(createForm.duration) : null,
        is_approved: createForm.is_approved
      };
      const createdTrack = await apiPost('/api/music/', payload);
      setMusic((previous) => [createdTrack, ...previous]);
      setCreateForm((previous) => ({ ...defaultCreateForm, workspace_id: previous.workspace_id }));
      resetCreateErrors();
      setCreating(false);
      success('Music track created.');
    } catch {
      showError('Failed to create music track.');
    }
  };

  const startEdit = (track) => {
    setEditingId(track.id);
    setEditErrors({});
    setEditForm({
      title: track.title || '',
      file_path: track.file_path || '',
      tags: track.tags || '',
      mood: track.mood || '',
      duration: track.duration ?? '',
      is_approved: Boolean(track.is_approved)
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditErrors({});
    setEditForm({});
  };

  const saveEdit = async (trackId) => {
    const errors = validateRequired(editForm, ['title', 'file_path']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill required fields before saving.');
      return;
    }

    try {
      const updated = await apiPut(`/api/music/${trackId}`, {
        title: editForm.title.trim(),
        file_path: editForm.file_path.trim(),
        tags: editForm.tags.trim() || null,
        mood: editForm.mood.trim() || null,
        duration: editForm.duration === '' ? null : Number(editForm.duration),
        is_approved: Boolean(editForm.is_approved)
      });
      setMusic((previous) => previous.map((item) => (item.id === trackId ? updated : item)));
      cancelEdit();
      success('Music track updated.');
    } catch {
      showError('Failed to update track.');
    }
  };

  const handleArchive = (trackId) => {
    archiveId(ENTITY_KEY, trackId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds((previous) => {
      const next = new Set(previous);
      next.delete(trackId);
      return next;
    });
    info('Track archived.');
  };

  const handleRestore = (trackId) => {
    unarchiveId(ENTITY_KEY, trackId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Track restored from archive.');
  };

  const handleHardDelete = async (trackId) => {
    if (!window.confirm('Permanently delete this track?')) {
      return;
    }

    try {
      await apiDelete(`/api/music/${trackId}`);
      unarchiveId(ENTITY_KEY, trackId);
      setArchivedIds(getArchivedIdSet(ENTITY_KEY));
      setMusic((previous) => previous.filter((item) => item.id !== trackId));
      success('Track deleted permanently.');
    } catch {
      showError('Failed to delete track.');
    }
  };

  const toggleSelection = (trackId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
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
    if (selectedIds.size === 0) {
      return;
    }
    selectedIds.forEach((id) => archiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected tracks archived.');
  };

  const handleBulkRestore = () => {
    if (selectedIds.size === 0) {
      return;
    }
    selectedIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected tracks restored.');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected tracks?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/music/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    successIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setMusic((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} tracks.`);
    if (successIds.length !== ids.length) {
      showError('Some tracks failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('music-library-export.json', exportRows);
    success(`Exported ${exportRows.length} tracks.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          title: String(row.title || '').trim(),
          file_path: String(row.file_path || '').trim(),
          tags: row.tags ? String(row.tags) : null,
          mood: row.mood ? String(row.mood) : null,
          duration: row.duration !== undefined && row.duration !== null ? Number(row.duration) : null,
          is_approved: Boolean(row.is_approved)
        };

        if (!payload.workspace_id || !payload.title || !payload.file_path) {
          continue;
        }

        await apiPost('/api/music/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/music/');
      setMusic(refreshed);
      success(`Imported ${createdCount} tracks.`);
    } catch {
      showError('Import failed. Ensure the file is valid JSON array data.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Music Library</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Music'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Music Track</h3>
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
                  <option key={workspace.id} value={workspace.id}>
                    {workspace.name}
                  </option>
                ))}
              </select>
              {createErrors.workspace_id ? <div className="field-error">Workspace is required.</div> : null}
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
              Tags
              <input
                value={createForm.tags}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, tags: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Mood
              <input
                value={createForm.mood}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, mood: event.target.value }))}
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
          </div>
          <label style={{ display: 'inline-flex', gap: '0.45rem', marginTop: '0.9rem' }}>
            <input
              type="checkbox"
              checked={createForm.is_approved}
              onChange={(event) => setCreateForm((previous) => ({ ...previous, is_approved: event.target.checked }))}
            />
            Approved
          </label>
          <div>
            <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
              Save Track
            </button>
          </div>
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
          { value: 'title', label: 'Title' },
          { value: 'mood', label: 'Mood' },
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
          <p className="text-gray-500">No tracks to display.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Mood</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Approved</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((track) => {
                  const isEditing = editingId === track.id;
                  return (
                    <tr key={track.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(track.id)} onChange={() => toggleSelection(track.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input
                              value={editForm.title}
                              className="form-input"
                              onChange={(event) => setEditForm((previous) => ({ ...previous, title: event.target.value }))}
                            />
                            {editErrors.title ? <div className="field-error">Title is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{track.title}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            value={editForm.tags}
                            className="form-input"
                            onChange={(event) => setEditForm((previous) => ({ ...previous, tags: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{track.tags || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            value={editForm.mood}
                            className="form-input"
                            onChange={(event) => setEditForm((previous) => ({ ...previous, mood: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{track.mood || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            type="number"
                            min="0"
                            step="0.1"
                            value={editForm.duration}
                            className="form-input"
                            onChange={(event) => setEditForm((previous) => ({ ...previous, duration: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{track.duration ? `${track.duration}s` : 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <label style={{ display: 'inline-flex', gap: '0.3rem' }}>
                            <input
                              type="checkbox"
                              checked={Boolean(editForm.is_approved)}
                              onChange={(event) =>
                                setEditForm((previous) => ({ ...previous, is_approved: event.target.checked }))
                              }
                            />
                            Approved
                          </label>
                        ) : (
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            track.is_approved ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                          }`}>
                            {track.is_approved ? 'Approved' : 'Pending'}
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(track.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(track)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {showArchived ? (
                              <button onClick={() => handleRestore(track.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button>
                            ) : (
                              <button onClick={() => handleArchive(track.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>
                            )}
                            <button onClick={() => handleHardDelete(track.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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
            <button className="tiny-button" type="button" onClick={() => setPage((previous) => Math.max(1, previous - 1))}>
              Prev
            </button>
            <span>{page} / {pageCount}</span>
            <button className="tiny-button" type="button" onClick={() => setPage((previous) => Math.min(pageCount, previous + 1))}>
              Next
            </button>
          </div>
        </>
      )}
    </div>
  );
};

export default MusicLibrary;
