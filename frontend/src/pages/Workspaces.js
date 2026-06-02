import React, { useEffect, useMemo, useState } from 'react';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/api';
import { useToast } from '../context/ToastContext';

const defaultForm = {
  name: '',
  description: ''
};

const Workspaces = () => {
  const { success, error: showError, info } = useToast();

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState(defaultForm);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(defaultForm);

  useEffect(() => {
    const loadRows = async () => {
      try {
        const data = await apiGet('/api/workspaces/');
        setRows(data);
      } catch {
        showError('Unable to load workspaces.');
      } finally {
        setLoading(false);
      }
    };

    loadRows();
  }, [showError]);

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)),
    [rows]
  );

  const submitCreate = async (event) => {
    event.preventDefault();
    const name = createForm.name.trim();
    if (!name) {
      showError('Workspace name is required.');
      return;
    }

    try {
      const created = await apiPost('/api/workspaces/', {
        name,
        description: createForm.description.trim() || null
      });
      setRows((previous) => [created, ...previous]);
      setCreateForm(defaultForm);
      setCreating(false);
      success('Workspace created.');
    } catch {
      showError('Failed to create workspace. Name may already exist.');
    }
  };

  const startEdit = (workspace) => {
    setEditingId(workspace.id);
    setEditForm({
      name: workspace.name || '',
      description: workspace.description || ''
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm(defaultForm);
  };

  const saveEdit = async (workspaceId) => {
    const name = editForm.name.trim();
    if (!name) {
      showError('Workspace name is required.');
      return;
    }

    try {
      const updated = await apiPut(`/api/workspaces/${workspaceId}`, {
        name,
        description: editForm.description.trim() || null
      });
      setRows((previous) => previous.map((row) => (row.id === workspaceId ? updated : row)));
      cancelEdit();
      success('Workspace updated.');
    } catch {
      showError('Failed to update workspace.');
    }
  };

  const deleteWorkspace = async (workspaceId) => {
    if (!window.confirm('Delete this workspace? This can fail if related records exist.')) {
      return;
    }

    try {
      await apiDelete(`/api/workspaces/${workspaceId}`);
      setRows((previous) => previous.filter((row) => row.id !== workspaceId));
      info('Workspace deleted.');
    } catch {
      showError('Failed to delete workspace. Remove dependent records first.');
    }
  };

  if (loading) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">Workspaces</h2>
        <button onClick={() => setCreating((previous) => !previous)} className="theme-toggle" type="button">
          {creating ? 'Close Form' : 'Add Workspace'}
        </button>
      </div>

      {creating ? (
        <form className="feature-card" onSubmit={submitCreate}>
          <h3>Add Workspace</h3>
          <div className="stage-list" style={{ marginTop: '0.9rem' }}>
            <label>
              Name *
              <input
                className="form-input"
                style={{ marginTop: '0.4rem' }}
                value={createForm.name}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, name: event.target.value }))}
              />
            </label>
            <label>
              Description
              <input
                className="form-input"
                style={{ marginTop: '0.4rem' }}
                value={createForm.description}
                onChange={(event) => setCreateForm((previous) => ({ ...previous, description: event.target.value }))}
              />
            </label>
          </div>
          <button className="tiny-button" type="submit" style={{ marginTop: '0.8rem' }}>Save Workspace</button>
        </form>
      ) : null}

      <div className="feature-card">
        {sortedRows.length === 0 ? (
          <p>No workspaces yet. Create one to begin setting up avatars, channels, and sources.</p>
        ) : (
          <div className="table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Name</th>
                  <th>Description</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.map((workspace) => {
                  const editing = editingId === workspace.id;
                  return (
                    <tr key={workspace.id}>
                      <td>{workspace.id}</td>
                      <td>
                        {editing ? (
                          <input
                            className="form-input"
                            value={editForm.name}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, name: event.target.value }))}
                          />
                        ) : workspace.name}
                      </td>
                      <td>
                        {editing ? (
                          <input
                            className="form-input"
                            value={editForm.description}
                            onChange={(event) => setEditForm((previous) => ({ ...previous, description: event.target.value }))}
                          />
                        ) : (workspace.description || '—')}
                      </td>
                      <td>{workspace.created_at ? new Date(workspace.created_at).toLocaleString() : '—'}</td>
                      <td>
                        <div className="toolbar-group">
                          {editing ? (
                            <>
                              <button className="tiny-button" type="button" onClick={() => saveEdit(workspace.id)}>Save</button>
                              <button className="tiny-button" type="button" onClick={cancelEdit}>Cancel</button>
                            </>
                          ) : (
                            <>
                              <button className="tiny-button" type="button" onClick={() => startEdit(workspace)}>Edit</button>
                              <button className="tiny-button" type="button" onClick={() => deleteWorkspace(workspace.id)}>Delete</button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Workspaces;
