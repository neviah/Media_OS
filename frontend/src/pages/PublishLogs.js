import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { archiveId, getArchivedIdSet, unarchiveId } from '../lib/archiveStore';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const ENTITY_KEY = 'publish_logs';
const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  channel_id: '',
  video_id: '',
  platform: '',
  status: 'queued',
  platform_video_id: ''
};

const PublishLogs = () => {
  const { success, error: showError, info } = useToast();

  const [publishLogs, setPublishLogs] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [videos, setVideos] = useState([]);
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
  const [sortKey, setSortKey] = useState('published_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => getArchivedIdSet(ENTITY_KEY));

  useEffect(() => {
    const loadData = async () => {
      try {
        const [logData, workspaceData, channelData, videoData] = await Promise.all([
          apiGet('/api/publish-logs/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/videos/')
        ]);
        setPublishLogs(logData);
        setWorkspaces(workspaceData);
        setChannels(channelData);
        setVideos(videoData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : ''),
          channel_id: previous.channel_id || (channelData[0] ? String(channelData[0].id) : ''),
          video_id: previous.video_id || (videoData[0] ? String(videoData[0].id) : '')
        }));
      } catch {
        showError('Unable to load publish logs.');
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

  const videosForCreate = useMemo(() => {
    return videos.filter((video) => {
      const workspaceMatches = !createForm.workspace_id || String(video.workspace_id) === String(createForm.workspace_id);
      const channelMatches = !createForm.channel_id || String(video.channel_id) === String(createForm.channel_id);
      return workspaceMatches && channelMatches;
    });
  }, [videos, createForm.workspace_id, createForm.channel_id]);

  useEffect(() => {
    if (channelsForCreate.length > 0 && !channelsForCreate.some((item) => String(item.id) === String(createForm.channel_id))) {
      setCreateForm((previous) => ({ ...previous, channel_id: String(channelsForCreate[0].id) }));
    }
  }, [channelsForCreate, createForm.channel_id]);

  useEffect(() => {
    if (videosForCreate.length > 0 && !videosForCreate.some((item) => String(item.id) === String(createForm.video_id))) {
      setCreateForm((previous) => ({ ...previous, video_id: String(videosForCreate[0].id) }));
    }
  }, [videosForCreate, createForm.video_id]);

  const filteredByArchive = useMemo(() => {
    const base = publishLogs.filter((log) => (showArchived ? archivedIds.has(log.id) : !archivedIds.has(log.id)));
    return base.filter((log) => {
      const workspaceMatches = workspaceFilter === 'all' || String(log.workspace_id) === workspaceFilter;
      const channelMatches = channelFilter === 'all' || String(log.channel_id) === channelFilter;
      return workspaceMatches && channelMatches;
    });
  }, [publishLogs, showArchived, archivedIds, workspaceFilter, channelFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredByArchive, searchText, ['platform', 'status', 'platform_video_id']),
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
    const errors = validateRequired(createForm, ['workspace_id', 'channel_id', 'video_id', 'platform', 'status']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill required publish log fields.');
      return;
    }

    try {
      const created = await apiPost('/api/publish-logs/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        video_id: Number(createForm.video_id),
        platform: createForm.platform.trim(),
        status: createForm.status.trim(),
        platform_video_id: createForm.platform_video_id.trim() || null
      });
      setPublishLogs((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...defaultCreateForm,
        workspace_id: previous.workspace_id,
        channel_id: previous.channel_id,
        video_id: previous.video_id
      }));
      setCreating(false);
      resetCreateErrors();
      success('Publish log created.');
    } catch {
      showError('Failed to create publish log.');
    }
  };

  const startEdit = (log) => {
    setEditingId(log.id);
    setEditErrors({});
    setEditForm({
      platform: log.platform || '',
      status: log.status || 'queued',
      platform_video_id: log.platform_video_id || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (logId) => {
    const errors = validateRequired(editForm, ['platform', 'status']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Platform and status are required.');
      return;
    }

    try {
      const updated = await apiPut(`/api/publish-logs/${logId}`, {
        platform: editForm.platform.trim(),
        status: editForm.status.trim(),
        platform_video_id: editForm.platform_video_id.trim() || null
      });
      setPublishLogs((previous) => previous.map((item) => (item.id === logId ? updated : item)));
      cancelEdit();
      success('Publish log updated.');
    } catch {
      showError('Failed to update publish log.');
    }
  };

  const handleArchive = (logId) => {
    archiveId(ENTITY_KEY, logId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Publish log archived.');
  };

  const handleRestore = (logId) => {
    unarchiveId(ENTITY_KEY, logId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Publish log restored.');
  };

  const handleHardDelete = async (logId) => {
    if (!window.confirm('Permanently delete this publish log?')) {
      return;
    }

    try {
      await apiDelete(`/api/publish-logs/${logId}`);
      unarchiveId(ENTITY_KEY, logId);
      setArchivedIds(getArchivedIdSet(ENTITY_KEY));
      setPublishLogs((previous) => previous.filter((item) => item.id !== logId));
      success('Publish log deleted permanently.');
    } catch {
      showError('Failed to delete publish log.');
    }
  };

  const toggleSelection = (logId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
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
    info('Selected publish logs archived.');
  };

  const handleBulkRestore = () => {
    selectedIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected publish logs restored.');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected publish logs?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/publish-logs/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    successIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setPublishLogs((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} publish logs.`);
    if (successIds.length !== ids.length) {
      showError('Some selected publish logs failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('publish-logs-export.json', exportRows);
    success(`Exported ${exportRows.length} publish logs.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          channel_id: Number(row.channel_id || createForm.channel_id),
          video_id: Number(row.video_id || createForm.video_id),
          platform: String(row.platform || '').trim(),
          status: row.status ? String(row.status) : 'queued',
          platform_video_id: row.platform_video_id ? String(row.platform_video_id) : null
        };

        if (!payload.workspace_id || !payload.channel_id || !payload.video_id || !payload.platform) {
          continue;
        }

        await apiPost('/api/publish-logs/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/publish-logs/');
      setPublishLogs(refreshed);
      success(`Imported ${createdCount} publish logs.`);
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
        <h2 className="text-xl font-bold">Publish Logs</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Create Publish Log'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Create Publish Log</h3>
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
              Video *
              <select
                value={createForm.video_id}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, video_id: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {videosForCreate.map((video) => (
                  <option key={video.id} value={video.id}>{`Video #${video.id}`}</option>
                ))}
              </select>
              {createErrors.video_id ? <div className="field-error">Video is required.</div> : null}
            </label>
            <label>
              Platform *
              <input
                value={createForm.platform}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, platform: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
              {createErrors.platform ? <div className="field-error">Platform is required.</div> : null}
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
              {createErrors.status ? <div className="field-error">Status is required.</div> : null}
            </label>
            <label>
              Platform Video ID
              <input
                value={createForm.platform_video_id}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, platform_video_id: event.target.value }))}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Publish Log
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
          { value: 'published_at', label: 'Published At' },
          { value: 'platform', label: 'Platform' },
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
          <p className="text-gray-500">No publish logs to display.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Video ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Platform Video ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((log) => {
                  const isEditing = editingId === log.id;
                  return (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(log.id)} onChange={() => toggleSelection(log.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{log.video_id}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input
                              className="form-input"
                              value={editForm.platform}
                              onChange={(event) => setEditForm((previous) => ({ ...previous, platform: event.target.value }))}
                            />
                            {editErrors.platform ? <div className="field-error">Platform is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500">{log.platform}</div>
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
                          <div className="text-sm text-gray-500">{log.status}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <input
                            className="form-input"
                            value={editForm.platform_video_id}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, platform_video_id: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500">{log.platform_video_id || 'N/A'}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(log.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(log)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {showArchived ? (
                              <button onClick={() => handleRestore(log.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button>
                            ) : (
                              <button onClick={() => handleArchive(log.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>
                            )}
                            <button onClick={() => handleHardDelete(log.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default PublishLogs;
