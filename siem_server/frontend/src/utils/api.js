export function buildQuery(params = {}) {
  const usp = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v === null || v === undefined) return
    const s = String(v).trim()
    if (s !== '') usp.set(k, s)
  })
  return usp.toString()
}

export async function fetchJSON(url, init) {
  const res = await fetch(url, init)
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
  return res.json()
}
