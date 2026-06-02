const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:8000';

function buildAuthHeaders() {
  const headers = {};
  const apiKey = window.localStorage.getItem('mediaos_api_key');
  const role = window.localStorage.getItem('mediaos_role');

  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }

  if (role) {
    headers['x-user-role'] = role;
  }

  return headers;
}

async function parseResponse(response) {
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Request failed with status ${response.status}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json();
}

export async function apiGet(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      ...buildAuthHeaders()
    }
  });
  return parseResponse(response);
}

export async function apiPost(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders()
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function apiPut(path, payload) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...buildAuthHeaders()
    },
    body: JSON.stringify(payload)
  });

  return parseResponse(response);
}

export async function apiDelete(path) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: {
      ...buildAuthHeaders()
    }
  });

  return parseResponse(response);
}
