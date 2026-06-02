const STORAGE_KEY = 'mediaos-archived-items';

function readAll() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {};
    }
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function writeAll(store) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function getArchivedIdSet(entityKey) {
  const store = readAll();
  const ids = store[entityKey] || [];
  return new Set(ids.map((id) => Number(id)));
}

export function archiveId(entityKey, id) {
  const store = readAll();
  const next = new Set((store[entityKey] || []).map((item) => Number(item)));
  next.add(Number(id));
  store[entityKey] = Array.from(next);
  writeAll(store);
}

export function unarchiveId(entityKey, id) {
  const store = readAll();
  const next = new Set((store[entityKey] || []).map((item) => Number(item)));
  next.delete(Number(id));
  store[entityKey] = Array.from(next);
  writeAll(store);
}
