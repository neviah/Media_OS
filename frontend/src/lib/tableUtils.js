export function sortRows(rows, sortKey, sortDirection) {
  if (!sortKey) {
    return rows;
  }

  const copy = [...rows];
  copy.sort((left, right) => {
    const leftValue = left[sortKey];
    const rightValue = right[sortKey];

    if (leftValue === rightValue) {
      return 0;
    }

    if (leftValue === undefined || leftValue === null) {
      return 1;
    }

    if (rightValue === undefined || rightValue === null) {
      return -1;
    }

    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return sortDirection === 'asc' ? leftValue - rightValue : rightValue - leftValue;
    }

    const normalizedLeft = String(leftValue).toLowerCase();
    const normalizedRight = String(rightValue).toLowerCase();
    const comparison = normalizedLeft.localeCompare(normalizedRight);
    return sortDirection === 'asc' ? comparison : -comparison;
  });

  return copy;
}

export function filterRows(rows, searchText, fields) {
  if (!searchText.trim()) {
    return rows;
  }

  const query = searchText.toLowerCase();
  return rows.filter((row) =>
    fields.some((field) => {
      const value = row[field];
      return value !== undefined && value !== null && String(value).toLowerCase().includes(query);
    })
  );
}

export function paginateRows(rows, page, pageSize) {
  const safePage = Math.max(page, 1);
  const startIndex = (safePage - 1) * pageSize;
  return rows.slice(startIndex, startIndex + pageSize);
}

export function validateRequired(values, requiredKeys) {
  const errors = {};
  requiredKeys.forEach((key) => {
    const value = values[key];
    if (value === undefined || value === null || String(value).trim() === '') {
      errors[key] = 'Required';
    }
  });
  return errors;
}

export function exportJsonFile(fileName, rows) {
  const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.URL.revokeObjectURL(url);
}

export function parseJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '[]'));
        if (!Array.isArray(parsed)) {
          reject(new Error('JSON file must contain an array.'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error('Invalid JSON file.'));
      }
    };
    reader.onerror = () => reject(new Error('Unable to read file.'));
    reader.readAsText(file);
  });
}
