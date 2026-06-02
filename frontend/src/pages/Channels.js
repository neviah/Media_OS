import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  avatar_id: '',
  name: '',
  script_style_preset: ''
};

const Channels = () => {
  const { success, error: showError, info } = useToast();

  const [channels, setChannels] = useState([]);
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
  const [avatarFilter, setAvatarFilter] = useState('all');
  const [sortKey, setSortKey] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [page, setPage] = useState(1);
  const [showArchived, setShowArchived] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const [channelData, avatarData, workspaceData] = await Promise.all([
          apiGet('/api/channels/'),
          apiGet('/api/avatars/'),
          apiGet('/api/workspaces/')
        ]);
        setChannels(channelData);
        setAvatars(avatarData);
        setWorkspaces(workspaceData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : ''),
          avatar_id: previous.avatar_id || (avatarData[0] ? String(avatarData[0].id) : '')
        }));
      } catch {
        showError('Unable to load channels. Verify backend connectivity.');
      } finally {
        setLoading(false);
      }
    };

    fetchChannels();
  }, [showError]);

  const avatarsForCreate = useMemo(() => {
    if (!createForm.workspace_id) {
      return avatars;
    }
    return avatars.filter((avatar) => String(avatar.workspace_id) === String(createForm.workspace_id));
  }, [avatars, createForm.workspace_id]);

  useEffect(() => {
    if (avatarsForCreate.length > 0 && !avatarsForCreate.some((item) => String(item.id) === String(createForm.avatar_id))) {
      setCreateForm((previous) => ({ ...previous, avatar_id: String(avatarsForCreate[0].id) }));
    }
  }, [avatarsForCreate, createForm.avatar_id]);

  const filteredRows = useMemo(() => {
    return channels.filter((channel) => {
      const archiveMatches = showArchived ? !channel.is_active : channel.is_active;
      const workspaceMatches = workspaceFilter === 'all' || String(channel.workspace_id) === workspaceFilter;
      const avatarMatches = avatarFilter === 'all' || String(channel.avatar_id) === avatarFilter;
      return archiveMatches && workspaceMatches && avatarMatches;
    });
  }, [channels, showArchived, workspaceFilter, avatarFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredRows, searchText, ['name', 'script_style_preset']),
    [filteredRows, searchText]
  );
  const sortedRows = useMemo(() => sortRows(searchedRows, sortKey, sortDirection), [searchedRows, sortKey, sortDirection]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const pageRows = useMemo(() => paginateRows(sortedRows, page, PAGE_SIZE), [sortedRows, page]);

  useEffect(() => {
    setPage(1);
  }, [searchText, workspaceFilter, avatarFilter, sortKey, sortDirection, showArchived]);

  useEffect(() => {
    if (page > pageCount) {
      setPage(pageCount);
    }
  }, [page, pageCount]);

  const resetCreateErrors = () => setCreateErrors({});

  const handleCreateSubmit = async (event) => {
    event.preventDefault();
    const errors = validateRequired(createForm, ['workspace_id', 'avatar_id', 'name']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Workspace, avatar, and name are required.');
      return;
    }

    try {
      const payload = {
        workspace_id: Number(createForm.workspace_id),
        avatar_id: Number(createForm.avatar_id),
        name: createForm.name.trim(),
        script_style_preset: createForm.script_style_preset.trim() || null,
        is_active: true
      };

      const newChannel = await apiPost('/api/channels/', payload);
      setChannels((previous) => [newChannel, ...previous]);
      setCreateForm((previous) => ({
        ...defaultCreateForm,
        workspace_id: previous.workspace_id,
        avatar_id: previous.avatar_id
      }));
      setCreating(false);
      resetCreateErrors();
      success('Channel created.');
    } catch {
      showError('Failed to create channel.');
    }
  };

  const startEdit = (channel) => {
    setEditingId(channel.id);
    setEditErrors({});
    setEditForm({
      name: channel.name || '',
      script_style_preset: channel.script_style_preset || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (channelId) => {
    const errors = validateRequired(editForm, ['name']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Name is required.');
      return;
    }

    try {
      const updatedChannel = await apiPut(`/api/channels/${channelId}`, {
        name: editForm.name.trim(),
        script_style_preset: editForm.script_style_preset.trim() || null
      });
      setChannels((previous) => previous.map((item) => (item.id === channelId ? updatedChannel : item)));
      cancelEdit();
      success('Channel updated.');
    } catch {
      showError('Failed to update channel.');
    }
  };

  const setActiveState = async (channelId, nextActive) => {
    try {
      const updatedChannel = await apiPut(`/api/channels/${channelId}`, { is_active: nextActive });
      setChannels((previous) => previous.map((item) => (item.id === channelId ? updatedChannel : item)));
      info(nextActive ? 'Channel restored.' : 'Channel archived.');
    } catch {
      showError('Failed to update channel status.');
    }
  };

  const handleHardDelete = async (channelId) => {
    if (!window.confirm('Permanently delete this channel?')) {
      return;
    }

    try {
      await apiDelete(`/api/channels/${channelId}`);
      setChannels((previous) => previous.filter((channel) => channel.id !== channelId));
      success('Channel deleted permanently.');
    } catch {
      showError('Failed to delete channel.');
    }
  };

  const toggleSelection = (channelId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(channelId)) {
        next.delete(channelId);
      } else {
        next.add(channelId);
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
    const results = await Promise.allSettled(ids.map((id) => apiPut(`/api/channels/${id}`, { is_active: false })));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    setChannels((previous) => previous.map((item) => (successIds.includes(item.id) ? { ...item, is_active: false } : item)));
    setSelectedIds(new Set());
    info(`Archived ${successIds.length} channels.`);
  };

  const handleBulkRestore = async () => {
    if (selectedIds.size === 0) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiPut(`/api/channels/${id}`, { is_active: true })));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    setChannels((previous) => previous.map((item) => (successIds.includes(item.id) ? { ...item, is_active: true } : item)));
    setSelectedIds(new Set());
    info(`Restored ${successIds.length} channels.`);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected channels?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/channels/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    setChannels((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} channels.`);
    if (successIds.length !== ids.length) {
      showError('Some selected channels failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('channels-export.json', exportRows);
    success(`Exported ${exportRows.length} channels.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          avatar_id: Number(row.avatar_id || createForm.avatar_id),
          name: String(row.name || '').trim(),
          script_style_preset: row.script_style_preset ? String(row.script_style_preset) : null,
          is_active: row.is_active !== undefined ? Boolean(row.is_active) : true
        };

        if (!payload.workspace_id || !payload.avatar_id || !payload.name) {
          continue;
        }

        await apiPost('/api/channels/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/channels/');
      setChannels(refreshed);
      success(`Imported ${createdCount} channels.`);
    } catch {
      showError('Import failed. Ensure file contains valid JSON array rows.');
    }
  };

  const resolveAvatarName = (avatarId) => {
    const avatar = avatars.find((item) => item.id === avatarId);
    return avatar ? avatar.name : 'N/A';
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  const allPageSelected = pageRows.length > 0 && pageRows.every((row) => selectedIds.has(row.id));
  const avatarFilterOptions = workspaceFilter === 'all'
    ? avatars
    : avatars.filter((avatar) => String(avatar.workspace_id) === workspaceFilter);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Channels</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Create Channel'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Channel</h3>
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
              Avatar *
              <select
                value={createForm.avatar_id}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, avatar_id: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {avatarsForCreate.map((avatar) => (
                  <option key={avatar.id} value={avatar.id}>{avatar.name}</option>
                ))}
              </select>
              {createErrors.avatar_id ? <div className="field-error">Avatar is required.</div> : null}
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
              Script Style
              <input
                value={createForm.script_style_preset}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, script_style_preset: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>

          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Channel
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
          <select className="form-input" style={{ width: '180px' }} value={avatarFilter} onChange={(event) => setAvatarFilter(event.target.value)}>
            <option value="all">All avatars</option>
            {avatarFilterOptions.map((avatar) => (
              <option key={avatar.id} value={avatar.id}>{avatar.name}</option>
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
          { value: 'script_style_preset', label: 'Script Style' },
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
          <p className="text-gray-500">No channels to display.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Avatar</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Script Style</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((channel) => {
                  const isEditing = editingId === channel.id;
                  return (
                    <tr key={channel.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(channel.id)} onChange={() => toggleSelection(channel.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input className="form-input" value={editForm.name} onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))} />
                            {editErrors.name ? <div className="field-error">Name is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm font-medium text-gray-900">{channel.name}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{resolveAvatarName(channel.avatar_id)}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input className="form-input" value={editForm.script_style_preset} onChange={(event) => setEditForm((previous) => ({ ...previous, script_style_preset: event.target.value }))} />
                        ) : (
                          <div className="text-sm text-gray-500">{channel.script_style_preset || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          channel.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {channel.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(channel.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(channel)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {channel.is_active ? <button onClick={() => setActiveState(channel.id, false)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button> : <button onClick={() => setActiveState(channel.id, true)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button>}
                            <button onClick={() => handleHardDelete(channel.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Channels;
