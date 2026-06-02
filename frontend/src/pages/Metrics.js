import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { archiveId, getArchivedIdSet, unarchiveId } from '../lib/archiveStore';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const ENTITY_KEY = 'metrics';
const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  channel_id: '',
  video_id: '',
  platform: '',
  views: '',
  likes: '',
  comments: '',
  shares: '',
  watch_time: ''
};

const Metrics = () => {
  const { success, error: showError, info } = useToast();

  const [metrics, setMetrics] = useState([]);
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
  const [sortKey, setSortKey] = useState('recorded_at');
  const [sortDirection, setSortDirection] = useState('desc');
  const [page, setPage] = useState(1);

  const [selectedIds, setSelectedIds] = useState(new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [archivedIds, setArchivedIds] = useState(() => getArchivedIdSet(ENTITY_KEY));

  useEffect(() => {
    const loadData = async () => {
      try {
        const [metricData, workspaceData, channelData, videoData] = await Promise.all([
          apiGet('/api/metrics/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/videos/')
        ]);
        setMetrics(metricData);
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
        showError('Unable to load metrics.');
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
    const base = metrics.filter((metric) => (showArchived ? archivedIds.has(metric.id) : !archivedIds.has(metric.id)));
    return base.filter((metric) => {
      const workspaceMatches = workspaceFilter === 'all' || String(metric.workspace_id) === workspaceFilter;
      const channelMatches = channelFilter === 'all' || String(metric.channel_id) === channelFilter;
      return workspaceMatches && channelMatches;
    });
  }, [metrics, showArchived, archivedIds, workspaceFilter, channelFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredByArchive, searchText, ['platform']),
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
    const errors = validateRequired(createForm, ['workspace_id', 'channel_id', 'video_id', 'platform']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill required metric fields.');
      return;
    }

    try {
      const created = await apiPost('/api/metrics/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        video_id: Number(createForm.video_id),
        platform: createForm.platform.trim(),
        views: createForm.views ? Number(createForm.views) : 0,
        likes: createForm.likes ? Number(createForm.likes) : 0,
        comments: createForm.comments ? Number(createForm.comments) : 0,
        shares: createForm.shares ? Number(createForm.shares) : 0,
        watch_time: createForm.watch_time ? Number(createForm.watch_time) : null
      });
      setMetrics((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...defaultCreateForm,
        workspace_id: previous.workspace_id,
        channel_id: previous.channel_id,
        video_id: previous.video_id
      }));
      setCreating(false);
      resetCreateErrors();
      success('Metric created.');
    } catch {
      showError('Failed to create metric.');
    }
  };

  const startEdit = (metric) => {
    setEditingId(metric.id);
    setEditErrors({});
    setEditForm({
      platform: metric.platform || '',
      views: metric.views ?? 0,
      likes: metric.likes ?? 0,
      comments: metric.comments ?? 0,
      shares: metric.shares ?? 0,
      watch_time: metric.watch_time ?? ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (metricId) => {
    const errors = validateRequired(editForm, ['platform']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Platform is required.');
      return;
    }

    try {
      const updated = await apiPut(`/api/metrics/${metricId}`, {
        platform: editForm.platform.trim(),
        views: Number(editForm.views) || 0,
        likes: Number(editForm.likes) || 0,
        comments: Number(editForm.comments) || 0,
        shares: Number(editForm.shares) || 0,
        watch_time: editForm.watch_time === '' ? null : Number(editForm.watch_time)
      });
      setMetrics((previous) => previous.map((item) => (item.id === metricId ? updated : item)));
      cancelEdit();
      success('Metric updated.');
    } catch {
      showError('Failed to update metric.');
    }
  };

  const handleArchive = (metricId) => {
    archiveId(ENTITY_KEY, metricId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Metric archived.');
  };

  const handleRestore = (metricId) => {
    unarchiveId(ENTITY_KEY, metricId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Metric restored.');
  };

  const handleHardDelete = async (metricId) => {
    if (!window.confirm('Permanently delete this metric?')) {
      return;
    }

    try {
      await apiDelete(`/api/metrics/${metricId}`);
      unarchiveId(ENTITY_KEY, metricId);
      setArchivedIds(getArchivedIdSet(ENTITY_KEY));
      setMetrics((previous) => previous.filter((item) => item.id !== metricId));
      success('Metric deleted permanently.');
    } catch {
      showError('Failed to delete metric.');
    }
  };

  const toggleSelection = (metricId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(metricId)) {
        next.delete(metricId);
      } else {
        next.add(metricId);
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
    info('Selected metrics archived.');
  };

  const handleBulkRestore = () => {
    selectedIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected metrics restored.');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected metrics?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/metrics/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    successIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setMetrics((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} metrics.`);
    if (successIds.length !== ids.length) {
      showError('Some selected metrics failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('metrics-export.json', exportRows);
    success(`Exported ${exportRows.length} metrics.`);
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
          views: row.views !== undefined && row.views !== null ? Number(row.views) : 0,
          likes: row.likes !== undefined && row.likes !== null ? Number(row.likes) : 0,
          comments: row.comments !== undefined && row.comments !== null ? Number(row.comments) : 0,
          shares: row.shares !== undefined && row.shares !== null ? Number(row.shares) : 0,
          watch_time: row.watch_time !== undefined && row.watch_time !== null ? Number(row.watch_time) : null
        };

        if (!payload.workspace_id || !payload.channel_id || !payload.video_id || !payload.platform) {
          continue;
        }

        await apiPost('/api/metrics/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/metrics/');
      setMetrics(refreshed);
      success(`Imported ${createdCount} metrics.`);
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
        <h2 className="text-xl font-bold">Metrics</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Metric'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Metric</h3>
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
              Views
              <input type="number" min="0" value={createForm.views} onChange={(event) => setCreateForm((previous) => ({ ...previous, views: event.target.value }))} className="form-input" style={{ marginTop: '0.4rem' }} />
            </label>
            <label>
              Likes
              <input type="number" min="0" value={createForm.likes} onChange={(event) => setCreateForm((previous) => ({ ...previous, likes: event.target.value }))} className="form-input" style={{ marginTop: '0.4rem' }} />
            </label>
            <label>
              Comments
              <input type="number" min="0" value={createForm.comments} onChange={(event) => setCreateForm((previous) => ({ ...previous, comments: event.target.value }))} className="form-input" style={{ marginTop: '0.4rem' }} />
            </label>
            <label>
              Shares
              <input type="number" min="0" value={createForm.shares} onChange={(event) => setCreateForm((previous) => ({ ...previous, shares: event.target.value }))} className="form-input" style={{ marginTop: '0.4rem' }} />
            </label>
            <label>
              Watch Time (seconds)
              <input type="number" min="0" value={createForm.watch_time} onChange={(event) => setCreateForm((previous) => ({ ...previous, watch_time: event.target.value }))} className="form-input" style={{ marginTop: '0.4rem' }} />
            </label>
          </div>
          <button type="submit" className="theme-toggle" style={{ marginTop: '0.85rem' }}>
            Save Metric
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
          { value: 'recorded_at', label: 'Recorded' },
          { value: 'views', label: 'Views' },
          { value: 'likes', label: 'Likes' }
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
        <div className="text-center py-10"><p className="text-gray-500">No metrics to display.</p></div>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Views</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Likes</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Comments</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Shares</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((metric) => {
                  const isEditing = editingId === metric.id;
                  return (
                    <tr key={metric.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap"><input type="checkbox" checked={selectedIds.has(metric.id)} onChange={() => toggleSelection(metric.id)} /></td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{metric.video_id}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {isEditing ? (
                          <>
                            <input className="form-input" value={editForm.platform} onChange={(event) => setEditForm((previous) => ({ ...previous, platform: event.target.value }))} />
                            {editErrors.platform ? <div className="field-error">Platform is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500">{metric.platform}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">{isEditing ? <input type="number" min="0" className="form-input" value={editForm.views} onChange={(event) => setEditForm((previous) => ({ ...previous, views: event.target.value }))} /> : <div className="text-sm text-gray-500">{metric.views}</div>}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{isEditing ? <input type="number" min="0" className="form-input" value={editForm.likes} onChange={(event) => setEditForm((previous) => ({ ...previous, likes: event.target.value }))} /> : <div className="text-sm text-gray-500">{metric.likes}</div>}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{isEditing ? <input type="number" min="0" className="form-input" value={editForm.comments} onChange={(event) => setEditForm((previous) => ({ ...previous, comments: event.target.value }))} /> : <div className="text-sm text-gray-500">{metric.comments}</div>}</td>
                      <td className="px-6 py-4 whitespace-nowrap">{isEditing ? <input type="number" min="0" className="form-input" value={editForm.shares} onChange={(event) => setEditForm((previous) => ({ ...previous, shares: event.target.value }))} /> : <div className="text-sm text-gray-500">{metric.shares}</div>}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(metric.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(metric)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {showArchived ? <button onClick={() => handleRestore(metric.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button> : <button onClick={() => handleArchive(metric.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>}
                            <button onClick={() => handleHardDelete(metric.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Metrics;
