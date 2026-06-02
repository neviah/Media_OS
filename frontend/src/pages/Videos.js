import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { archiveId, getArchivedIdSet, unarchiveId } from '../lib/archiveStore';
import { exportJsonFile, filterRows, paginateRows, parseJsonFile, sortRows, validateRequired } from '../lib/tableUtils';
import { useToast } from '../context/ToastContext';
import EntityTableToolbar from '../components/EntityTableToolbar';

const ENTITY_KEY = 'videos';
const PAGE_SIZE = 8;

const defaultCreateForm = {
  workspace_id: '',
  channel_id: '',
  audio_id: '',
  final_video_path: '',
  thumbnail_path: '',
  status: 'draft'
};

const Videos = () => {
  const { success, error: showError, info } = useToast();

  const [videos, setVideos] = useState([]);
  const [workspaces, setWorkspaces] = useState([]);
  const [channels, setChannels] = useState([]);
  const [audios, setAudios] = useState([]);
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
        const [videoData, workspaceData, channelData, audioData] = await Promise.all([
          apiGet('/api/videos/'),
          apiGet('/api/workspaces/'),
          apiGet('/api/channels/'),
          apiGet('/api/audios/')
        ]);
        setVideos(videoData);
        setWorkspaces(workspaceData);
        setChannels(channelData);
        setAudios(audioData);
        setCreateForm((previous) => ({
          ...previous,
          workspace_id: previous.workspace_id || (workspaceData[0] ? String(workspaceData[0].id) : ''),
          channel_id: previous.channel_id || (channelData[0] ? String(channelData[0].id) : ''),
          audio_id: previous.audio_id || (audioData[0] ? String(audioData[0].id) : '')
        }));
      } catch {
        showError('Unable to load videos.');
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

  const audiosForCreate = useMemo(() => {
    return audios.filter((audio) => {
      const workspaceMatches = !createForm.workspace_id || String(audio.workspace_id) === String(createForm.workspace_id);
      const channelMatches = !createForm.channel_id || String(audio.channel_id) === String(createForm.channel_id);
      return workspaceMatches && channelMatches;
    });
  }, [audios, createForm.workspace_id, createForm.channel_id]);

  useEffect(() => {
    if (channelsForCreate.length > 0 && !channelsForCreate.some((item) => String(item.id) === String(createForm.channel_id))) {
      setCreateForm((previous) => ({ ...previous, channel_id: String(channelsForCreate[0].id) }));
    }
  }, [channelsForCreate, createForm.channel_id]);

  useEffect(() => {
    if (audiosForCreate.length > 0 && !audiosForCreate.some((item) => String(item.id) === String(createForm.audio_id))) {
      setCreateForm((previous) => ({ ...previous, audio_id: String(audiosForCreate[0].id) }));
    }
  }, [audiosForCreate, createForm.audio_id]);

  const filteredByArchive = useMemo(() => {
    const base = videos.filter((video) => (showArchived ? archivedIds.has(video.id) : !archivedIds.has(video.id)));
    return base.filter((video) => {
      const workspaceMatches = workspaceFilter === 'all' || String(video.workspace_id) === workspaceFilter;
      const channelMatches = channelFilter === 'all' || String(video.channel_id) === channelFilter;
      return workspaceMatches && channelMatches;
    });
  }, [videos, showArchived, archivedIds, workspaceFilter, channelFilter]);

  const searchedRows = useMemo(
    () => filterRows(filteredByArchive, searchText, ['final_video_path', 'thumbnail_path', 'status']),
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
    const errors = validateRequired(createForm, ['workspace_id', 'channel_id', 'audio_id', 'final_video_path']);
    setCreateErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Please fill required video fields.');
      return;
    }

    try {
      const created = await apiPost('/api/videos/', {
        workspace_id: Number(createForm.workspace_id),
        channel_id: Number(createForm.channel_id),
        audio_id: Number(createForm.audio_id),
        final_video_path: createForm.final_video_path.trim(),
        thumbnail_path: createForm.thumbnail_path.trim() || null,
        status: createForm.status.trim() || 'draft'
      });
      setVideos((previous) => [created, ...previous]);
      setCreateForm((previous) => ({
        ...defaultCreateForm,
        workspace_id: previous.workspace_id,
        channel_id: previous.channel_id,
        audio_id: previous.audio_id
      }));
      setCreating(false);
      resetCreateErrors();
      success('Video created.');
    } catch {
      showError('Failed to create video.');
    }
  };

  const startEdit = (video) => {
    setEditingId(video.id);
    setEditErrors({});
    setEditForm({
      final_video_path: video.final_video_path || '',
      thumbnail_path: video.thumbnail_path || '',
      status: video.status || 'draft'
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({});
    setEditErrors({});
  };

  const saveEdit = async (videoId) => {
    const errors = validateRequired(editForm, ['final_video_path', 'status']);
    setEditErrors(errors);
    if (Object.keys(errors).length > 0) {
      showError('Final video path and status are required.');
      return;
    }

    try {
      const updated = await apiPut(`/api/videos/${videoId}`, {
        final_video_path: editForm.final_video_path.trim(),
        thumbnail_path: editForm.thumbnail_path.trim() || null,
        status: editForm.status.trim()
      });
      setVideos((previous) => previous.map((item) => (item.id === videoId ? updated : item)));
      cancelEdit();
      success('Video updated.');
    } catch {
      showError('Failed to update video.');
    }
  };

  const handleArchive = (videoId) => {
    archiveId(ENTITY_KEY, videoId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Video archived.');
  };

  const handleRestore = (videoId) => {
    unarchiveId(ENTITY_KEY, videoId);
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    info('Video restored.');
  };

  const handleHardDelete = async (videoId) => {
    if (!window.confirm('Permanently delete this video?')) {
      return;
    }

    try {
      await apiDelete(`/api/videos/${videoId}`);
      unarchiveId(ENTITY_KEY, videoId);
      setArchivedIds(getArchivedIdSet(ENTITY_KEY));
      setVideos((previous) => previous.filter((item) => item.id !== videoId));
      success('Video deleted permanently.');
    } catch {
      showError('Failed to delete video.');
    }
  };

  const toggleSelection = (videoId) => {
    setSelectedIds((previous) => {
      const next = new Set(previous);
      if (next.has(videoId)) {
        next.delete(videoId);
      } else {
        next.add(videoId);
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
    info('Selected videos archived.');
  };

  const handleBulkRestore = () => {
    selectedIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setSelectedIds(new Set());
    info('Selected videos restored.');
  };

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0 || !window.confirm('Permanently delete selected videos?')) {
      return;
    }

    const ids = Array.from(selectedIds);
    const results = await Promise.allSettled(ids.map((id) => apiDelete(`/api/videos/${id}`)));
    const successIds = ids.filter((_, index) => results[index].status === 'fulfilled');
    successIds.forEach((id) => unarchiveId(ENTITY_KEY, id));
    setArchivedIds(getArchivedIdSet(ENTITY_KEY));
    setVideos((previous) => previous.filter((item) => !successIds.includes(item.id)));
    setSelectedIds(new Set());
    success(`Deleted ${successIds.length} videos.`);
    if (successIds.length !== ids.length) {
      showError('Some selected videos failed to delete.');
    }
  };

  const handleExport = () => {
    const exportRows = selectedIds.size > 0 ? sortedRows.filter((row) => selectedIds.has(row.id)) : sortedRows;
    exportJsonFile('videos-export.json', exportRows);
    success(`Exported ${exportRows.length} videos.`);
  };

  const handleImport = async (file) => {
    try {
      const importedRows = await parseJsonFile(file);
      let createdCount = 0;

      for (const row of importedRows) {
        const payload = {
          workspace_id: Number(row.workspace_id || createForm.workspace_id),
          channel_id: Number(row.channel_id || createForm.channel_id),
          audio_id: Number(row.audio_id || createForm.audio_id),
          final_video_path: String(row.final_video_path || '').trim(),
          thumbnail_path: row.thumbnail_path ? String(row.thumbnail_path) : null,
          status: row.status ? String(row.status) : 'draft'
        };

        if (!payload.workspace_id || !payload.channel_id || !payload.audio_id || !payload.final_video_path) {
          continue;
        }

        await apiPost('/api/videos/', payload);
        createdCount += 1;
      }

      const refreshed = await apiGet('/api/videos/');
      setVideos(refreshed);
      success(`Imported ${createdCount} videos.`);
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
        <h2 className="text-xl font-bold">Videos</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle">
          {creating ? 'Close Form' : 'Add Video'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={handleCreateSubmit}>
          <h3>Add Video</h3>
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
              Audio *
              <select
                value={createForm.audio_id}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, audio_id: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              >
                {audiosForCreate.map((audio) => (
                  <option key={audio.id} value={audio.id}>{`Audio #${audio.id}`}</option>
                ))}
              </select>
              {createErrors.audio_id ? <div className="field-error">Audio is required.</div> : null}
            </label>
            <label>
              Final Video Path *
              <input
                value={createForm.final_video_path}
                onChange={(event) => {
                  setCreateForm((previous) => ({ ...previous, final_video_path: event.target.value }));
                  resetCreateErrors();
                }}
                className="form-input"
                style={{ marginTop: '0.4rem' }}
              />
              {createErrors.final_video_path ? <div className="field-error">Final path is required.</div> : null}
            </label>
            <label>
              Thumbnail Path
              <input
                value={createForm.thumbnail_path}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, thumbnail_path: event.target.value }))}
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
            Save Video
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
          <p className="text-gray-500">No videos to display.</p>
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Audio ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Final Video Path</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thumbnail</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pageRows.map((video) => {
                  const isEditing = editingId === video.id;
                  return (
                    <tr key={video.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <input type="checkbox" checked={selectedIds.has(video.id)} onChange={() => toggleSelection(video.id)} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm text-gray-500">{video.audio_id}</div></td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <>
                            <input
                              className="form-input"
                              value={editForm.final_video_path}
                              onChange={(event) =>
                                setEditForm((previous) => ({ ...previous, final_video_path: event.target.value }))
                              }
                            />
                            {editErrors.final_video_path ? <div className="field-error">Final path is required.</div> : null}
                          </>
                        ) : (
                          <div className="text-sm text-gray-500 max-w-xs truncate">{video.final_video_path}</div>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        {isEditing ? (
                          <input
                            className="form-input"
                            value={editForm.thumbnail_path}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, thumbnail_path: event.target.value }))}
                          />
                        ) : (
                          <div className="text-sm text-gray-500 max-w-xs truncate">{video.thumbnail_path || 'N/A'}</div>
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
                          <div className="text-sm text-gray-500">{video.status}</div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        {isEditing ? (
                          <>
                            <button onClick={() => saveEdit(video.id)} className="text-indigo-600 hover:text-indigo-900">Save</button>
                            <button onClick={cancelEdit} className="ml-4 text-gray-500 hover:text-gray-700">Cancel</button>
                          </>
                        ) : (
                          <>
                            <button onClick={() => startEdit(video)} className="text-yellow-600 hover:text-yellow-900">Edit</button>
                            {showArchived ? (
                              <button onClick={() => handleRestore(video.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Restore</button>
                            ) : (
                              <button onClick={() => handleArchive(video.id)} className="ml-4 text-indigo-600 hover:text-indigo-900">Archive</button>
                            )}
                            <button onClick={() => handleHardDelete(video.id)} className="ml-4 text-red-600 hover:text-red-900">Delete</button>
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

export default Videos;
