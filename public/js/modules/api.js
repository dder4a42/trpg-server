/**
 * Unified API client
 * Normalizes headers, credentials, and parsing helpers.
 */

function normalizeOptions(options = {}) {
  const normalized = { ...options };
  normalized.credentials = options.credentials || 'include';
  normalized.headers = {
    ...(options.headers || {})
  };

  if (options.body && typeof options.body === 'object' && !(options.body instanceof FormData)) {
    normalized.body = JSON.stringify(options.body);
    normalized.headers['Content-Type'] = normalized.headers['Content-Type'] || 'application/json';
  }

  return normalized;
}

export async function fetchResponse(url, options = {}) {
  const normalized = normalizeOptions(options);
  return fetch(url, normalized);
}

export async function fetchJson(url, options = {}) {
  const normalized = normalizeOptions(options);
  normalized.headers = {
    Accept: 'application/json',
    ...normalized.headers
  };

  const response = await fetch(url, normalized);
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  return { ok: response.ok, status: response.status, data, response };
}

export async function fetchText(url, options = {}) {
  const normalized = normalizeOptions(options);
  normalized.headers = {
    Accept: 'text/html, */*',
    ...normalized.headers
  };

  const response = await fetch(url, normalized);
  const text = await response.text();
  return { ok: response.ok, status: response.status, text, response };
}
