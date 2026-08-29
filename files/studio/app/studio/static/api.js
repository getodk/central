// Talks to the Studio API. The Central session token lives in sessionStorage
// and travels as a bearer header, so nothing here relies on cookies.

// This module lives at <base>/static/api.js, so its parent directory is <base>.
const BASE = new URL('../', import.meta.url).pathname.replace(/\/$/, '');
const TOKEN_KEY = 'studio.token';

export const api = {
  get token() { return sessionStorage.getItem(TOKEN_KEY) || ''; },
  set token(value) {
    if (value) sessionStorage.setItem(TOKEN_KEY, value);
    else sessionStorage.removeItem(TOKEN_KEY);
  },

  url(path) { return `${BASE}/api${path}`; },

  async request(path, { method = 'GET', body, raw = false, formData } = {}) {
    const headers = {};
    if (this.token) headers.Authorization = `Bearer ${this.token}`;
    let payload;
    if (formData) {
      payload = formData;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const response = await fetch(this.url(path), { method, headers, body: payload });

    if (response.status === 401) {
      this.token = '';
      window.dispatchEvent(new CustomEvent('studio:signed-out'));
      throw new ApiError('Your session has expired. Please sign in again.', 401);
    }
    if (!response.ok) throw new ApiError(await readError(response), response.status);
    if (raw) return response;
    if (response.status === 204) return null;
    return response.json();
  },

  signIn(email, password) {
    return this.request('/session', { method: 'POST', body: { email, password } });
  },

  // Reuse an existing Central browser session. The custom header is what keeps
  // this endpoint safe against cross-site use.
  async signInFromCookie() {
    const response = await fetch(this.url('/session/from-cookie'), {
      method: 'POST',
      headers: { 'X-Studio-Client': '1' },
      credentials: 'same-origin',
    });
    // 204 means there is no Central session to adopt, which is normal.
    if (!response.ok || response.status === 204) return null;
    return response.json();
  },

  signOut() { return this.request('/session', { method: 'DELETE' }); },
  projects() { return this.request('/projects'); },
  forms(projectId) { return this.request(`/projects/${projectId}/forms`); },
  formMeta(projectId, formId) {
    return this.request(`/projects/${projectId}/forms/${encodeURIComponent(formId)}/meta`);
  },
  questionTypes() { return this.request('/question-types'); },
  questionnaires(projectId) { return this.request(`/questionnaires?projectId=${projectId}`); },
  questionnaire(id) { return this.request(`/questionnaires/${id}`); },
  createQuestionnaire(projectId, document) {
    return this.request('/questionnaires', { method: 'POST', body: { projectId, document } });
  },
  saveQuestionnaire(id, document) {
    return this.request(`/questionnaires/${id}`, { method: 'PUT', body: document });
  },
  deleteQuestionnaire(id) {
    return this.request(`/questionnaires/${id}`, { method: 'DELETE' });
  },
  versions(id) { return this.request(`/questionnaires/${id}/versions`); },
  restoreVersion(id, versionId) {
    return this.request(`/questionnaires/${id}/versions/${versionId}/restore`, { method: 'POST' });
  },
  validate(document) { return this.request('/validate', { method: 'POST', body: document }); },
  publish(id, document, mode, bumpVersion) {
    return this.request(`/questionnaires/${id}/publish`, {
      method: 'POST',
      body: { document, mode, bumpVersion },
    });
  },
  importXlsform(file) {
    const formData = new FormData();
    formData.append('file', file);
    return this.request('/import', { method: 'POST', formData });
  },
  downloadXlsform(document) {
    return this.request('/xlsform', { method: 'POST', body: document, raw: true });
  },
  exportData(options) {
    return this.request('/export', { method: 'POST', body: options, raw: true });
  },
};

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function readError(response) {
  try {
    const body = await response.json();
    if (typeof body.detail === 'string') return body.detail;
    if (Array.isArray(body.detail)) {
      return body.detail.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join('; ');
    }
  } catch (_) { /* fall through to the status text */ }
  return `Request failed (${response.status})`;
}

// Save a fetch Response to disk under the filename the server chose.
export async function saveResponse(response, fallbackName) {
  const disposition = response.headers.get('Content-Disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = match ? match[1] : fallbackName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
