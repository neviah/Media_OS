import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { archiveId, getArchivedIdSet, unarchiveId } from '../lib/archiveStore';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const ENTITY_KEY = 'avatars';
const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  name: '',
  style_hints: '',
  channel_type: ''
};

const Avatars = () => {
  const navigate = useNavigate();
  const { success, error: showError, info } = useToast();

  const [avatars, setAvatars] = useState([]);
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
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => getArchivedIdSet(ENTITY_KEY));

  useEffect(() => {
    const fetchAvatars = async () => {
      try {
        const [avatarData, workspaceData] = await Promise.all([apiGet('/api/avatars/'), apiGet('/api/workspaces/')]);
        setAvatars(avatarData);
        setWorkspaces(workspaceData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : '')
        }));
      } catch {
        showError('Unable to load avatars. Verify the backend is running on port 8000.');
      } finally {
        setLoading(false);
      }
    };

    fetchAvatars();
  }, [showError]);

  const filteredByArchive = useMemo(() => {
    const base = avatars.filter((avatar) => (showArchived ? archivedIds.has(avatar.id) : !archivedIds.has(avatar.id)));
    if (workspaceFilter === 'all') {
      return base;
    }
    return base.filter((avatar) => String(avatar.workspace_id) === workspaceFilter);
  }, [avatars, showArchived, archivedIds, workspaceFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredByArchive, searchText, ['name', 'style_hints', 'channel_type']),
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
    const errors = validateRequired(createForm, ['workspace_id', 'name']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Workspace and name are required.');
      return;
    }

    try {
      const payload = {
        workspace_id: Number(createForm.workspace_id),
        name: createForm.name.trim(),
        style_hints: createForm.style_hints.trim() || null,
        channel_type: createForm.channel_type.trim() || null
      };
      const newAvatar = await apiPost('/api/avatars/', payload);
      setAvatars((previous) => [newAvatar, ...previous]);
      setCreateForm((previous) => ({ ...defaultCreateForm, workspace_id: previous.workspace_id }));
      setCreating(false);
      resetCreateErrors();
      success('Avatar created.');
    } catch {
      showError('Failed to create avatar.');
    }
  };

  const startEdit = (avatar) => {
    setEditingId(avatar.id);
    setEditErrors({});
    setEditForm({
      name: avatar.name || '',
      style_hints: avatar.style_hints || '',
      channel_type: avatar.channel_type || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (avatarId) => {
    const errors = validateRequired(editForm, ['name']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Name is required.');
      return;
    }

    try {
      const updatedAvatar = await apiPut(`/api/avatars/${avatarId}`, {
        name: editForm.name.trim(),
        style_hints: editForm.style_hints.trim() || null,
        channel_type: editForm.channel_type.trim() || null
      });
      setAvatars((previous) => previous.map((item) => (item.id === avatarId ? updatedAvatar : item)));
      cancelEdit();
      success('Avatar updated.');
    } catch {
      showError('Failed to update avatar.');
    }
  };

  const handleArchive = (avatarId) => {
    archiveId(ENTITY_KEY, avatarId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Avatar archived.');
  };

  const handleRestore = (avatarId) => {
    unarchiveId(ENTITY_KEY, avatarId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Avatar restored.');
  };

  const handleHardDelete = async (avatarId) => {
    if (!window.confirm('Permanently delete this avatar?')) {
      return;
    }

    try {
      await apiDelete(`/api/avatars/${avatarId}`);
      unarchiveId(ENTITY_KEY, avatarId);
      setArchivedIds(getArchivedIdSet(ENTITY_KEY));
      setAvatars((previous) => previous.filter((avatar) => avatar.id !== avatarId));
      success('Avatar deleted permanently.');
    } catch {
      showError('Failed to delete avatar.');
    }
  };

  const toggleSelection = (avatarId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(avatarId)) {
        next.delete(avatarId);
      } else {
        next.add(avatarId);
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
    info('Selected avatars archived.');
  };

  const handleBulkRestore = () => {
    selectedIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected avatars restored.');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected avatars?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/avatars/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    successIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setAvatars((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} avatars.`);
    if (successIds.length !== ids.length) {
      showError('Some avatars failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('avatars-export.json', exportRows);
    success(`Exported ${exportRows.length} avatars.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          name: String(row.name || '').trim(),
          style_hints: row.style_hints ? String(row.style_hints) : null,
          channel_type: row.channel_type ? String(row.channel_type) : null
        };

        if (!payload.workspace_id || !payload.name) {
          continue;
        }

        await apiPost('/api/avatars/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/avatars/');
      setAvatars(refreshed);
      success(`Imported ${createdCount} avatars.`);
    } catch {
      showError('Import failed. Ensure file contains valid JSON array rows.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Avatars</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Create Avatar'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Avatar</h3>
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
              Style Hints
              <input
                value={createForm.style_hints}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, style_hints: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
            <label>
              Channel Type
              <input
                value={createForm.channel_type}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, channel_type: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Avatar
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
          { value: 'name', label: 'Name' },
          { value: 'channel_type', label: 'Channel Type' },
          { value: 'created_at', label: 'Created' }
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
          <p className="text-gray-500">No avatars to display.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Style Hints</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Channel Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((avatar) => {
                  const isEditing = editingId === avatar.id;
                  return (
                    <tr key={avatar.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(avatar.id)} onChange={() => toggleSelection(avatar.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input className="form-input" value={editForm.name} onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))} />
                            {editErrors.name ? <div className="field-error">Name is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{avatar.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input className="form-input" value={editForm.style_hints} onChange={(event) => setEditForm((previous) => ({ ...previous, style_hints: event.target.value }))} />
                        ) : (
                          <div className="text-sm text-gray-500">{avatar.style_hints || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input className="form-input" value={editForm.channel_type} onChange={(event) => setEditForm((previous) => ({ ...previous, channel_type: event.target.value }))} />
                        ) : (
                          <div className="text-sm text-gray-500">{avatar.channel_type || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(avatar.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => navigate(`/avatars/${avatar.id}`)} className="text-indigo-600 hover:text-indigo-900">View</button>
                            <button onClick={() => startEdit(avatar)} className="ml-4 text-yellow-600 hover:text-yellow-900">Edit</button>
                            {showArchived ? <button onClick={() => handleRestore(avatar.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button> : <button onClick={() => handleArchive(avatar.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>}
                            <button onClick={() => handleHardDelete(avatar.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Avatars;
