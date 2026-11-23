import type { Candidate } from './candidate-types'

const ACCESS_KEY_STORAGE = 'clyptus-access-key'
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
export class LockedError extends Error {}

export const readAccessKey = () => { try { return sessionStorage.getItem(ACCESS_KEY_STORAGE) || '' } catch { return '' } }
export const saveAccessKey = (key: string) => { try { sessionStorage.setItem(ACCESS_KEY_STORAGE, key.trim()) } catch { /* private browsing: keep the key in memory for this page */ } }

export const api = async (path = '', init: RequestInit = {}) => {
  const headers = new Headers(init.headers); const key = readAccessKey(); if (key) headers.set('x-access-key', key); if (init.body) headers.set('Content-Type', 'application/json')
  const response = await fetch(`${API_BASE_URL}/candidates${path}`, { ...init, headers })
  if (response.status === 401) throw new LockedError('Access key required')
  if (!response.ok) throw new Error(`API ${response.status}`)
  return response
}

export const upsertInBatches = async (items: Candidate[]) => {
  let batch: Candidate[] = []; let size = 0; let latest: Candidate[] = []
  const flush = async () => { if (!batch.length) return; latest = await (await api('', { method: 'PUT', body: JSON.stringify(batch) })).json() as Candidate[]; batch = []; size = 0 }
  for (const item of items) { const itemSize = JSON.stringify(item).length; if (size + itemSize > 3_000_000) await flush(); batch.push(item); size += itemSize }
  await flush(); return latest
}
