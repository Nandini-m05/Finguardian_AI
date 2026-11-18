// Thin fetch wrapper around the FastAPI backend.
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {}
export const API_BASE = String(env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/+$/, '')

const TOKEN_KEY = 'fg_token'
export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY) } catch { return null } },
  set: (t) => { try { localStorage.setItem(TOKEN_KEY, t) } catch { /* private mode */ } },
  clear: () => { try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ } },
}

export class ApiError extends Error {
  constructor(status, message, detail) {
    super(message)
    this.status = status
    this.detail = detail
  }
}

/** FastAPI errors: {detail: "text"} | {detail: [{msg}, ...]} | {detail: {...}} */
function messageFrom(status, body) {
  const d = body && body.detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) return d.map((x) => String(x.msg || x).replace(/^Value error, /, '')).join(' ')
  if (d && typeof d === 'object') return d.detail || d.message || JSON.stringify(d)
  if (status === 429) return 'Too many requests. Wait a minute and try again.'
  if (status >= 500) return 'The server had a problem. Try again shortly.'
  return `Request failed (${status}).`
}

let onUnauthorized = () => {}
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn }

export async function api(path, { method = 'GET', body, auth = true, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = tokenStore.get()
  if (auth && token) headers.Authorization = `Bearer ${token}`

  let res
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, signal })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError(0, `Can't reach the API at ${API_BASE}. Is the backend running?`)
  }

  let data = null
  const text = await res.text()
  if (text) { try { data = JSON.parse(text) } catch { data = { detail: text } } }

  if (!res.ok) {
    if (res.status === 401 && auth) onUnauthorized()
    throw new ApiError(res.status, messageFrom(res.status, data), data && data.detail)
  }
  return data
}

export const Api = {
  health: () => api('/health', { auth: false }),
  login: (email, password) => api('/login', { method: 'POST', body: { email, password }, auth: false }),
  register: (email, password) => api('/register', { method: 'POST', body: { email, password }, auth: false }),
  me: () => api('/me'),
  analyze: (symbol, signal) => api('/analyze', { method: 'POST', body: { symbol, asset_type: 'stock' }, signal }),
  list: ({ limit = 200, offset = 0, symbol } = {}) => {
    const q = new URLSearchParams({ limit, offset })
    if (symbol) q.set('symbol', symbol)
    return api(`/analyses?${q}`)
  },
  detail: (id) => api(`/analyses/${encodeURIComponent(id)}`),
  resume: (id, decision) => api(`/analyze/${encodeURIComponent(id)}/resume`, { method: 'POST', body: { decision } }),
  pending: () => api('/admin/pending-reviews'),
}
