import React from 'react';

const EntityTableToolbar = ({
  searchText,
  onSearchChange,
  sortKey,
  onSortKeyChange,
  sortDirection,
  onSortDirectionChange,
  sortOptions,
  showArchived,
  onShowArchivedChange,
  selectedCount,
  onArchiveSelected,
  onUnarchiveSelected,
  onDeleteSelected,
  onExport,
  onImport
}) => {
  return (
    <div className="table-toolbar">
      <div className="toolbar-group">
        <input
          className="form-input"
          style={{ width: '220px' }}
          placeholder="Search"
          value={searchText}
          onChange={(event) => onSearchChange(event.target.value)}
        />
        <select className="form-input" value={sortKey} onChange={(event) => onSortKeyChange(event.target.value)}>
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </select>
        <button className="tiny-button" type="button" onClick={onSortDirectionChange}>
          {sortDirection === 'asc' ? 'Asc' : 'Desc'}
        </button>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
          <input type="checkbox" checked={showArchived} onChange={(event) => onShowArchivedChange(event.target.checked)} />
          Show archived
        </label>
      </div>

      <div className="toolbar-group">
        <span className="text-sm text-gray-500">Selected: {selectedCount}</span>
        <button className="tiny-button" type="button" onClick={onArchiveSelected} disabled={selectedCount === 0 || showArchived}>
          Archive Selected
        </button>
        <button className="tiny-button" type="button" onClick={onUnarchiveSelected} disabled={selectedCount === 0 || !showArchived}>
          Restore Selected
        </button>
        <button className="tiny-button" type="button" onClick={onDeleteSelected} disabled={selectedCount === 0}>
          Delete Selected
        </button>
        <button className="tiny-button" type="button" onClick={onExport}>
          Export
        </button>
        <label className="tiny-button" style={{ cursor: 'pointer' }}>
          Import
          <input
            type="file"
            accept="application/json"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onImport(file);
              }
              event.target.value = '';
            }}
            style={{ display: 'none' }}
          />
        </label>
      </div>
    </div>
  );
};

export default EntityTableToolbar;
