const API_URL = import.meta.env.VITE_API_URL || window.location.origin

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('dv_token')
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {}
  const res = await fetch(`${API_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...authHeader, ...(options.headers || {}) },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(text || `HTTP ${res.status}`)
  }
  const contentType = res.headers.get('content-type') || ''
  if (contentType.includes('application/json')) return res.json()
  return null
}
