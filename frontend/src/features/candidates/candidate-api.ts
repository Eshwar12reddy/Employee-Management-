import type { Candidate } from './candidate-types'

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '')
let csrfToken = ''
export const CANDIDATES_CACHE_KEY = 'clyptus-candidates'
export const LOCAL_MIGRATION_KEY = 'clyptus-candidates-migrated'

export type UserRole = 'CEO' | 'TEAM_LEAD'
export type AppUser = { id: string; email: string; name: string; role: UserRole }
export class UnauthorizedError extends Error {}
export class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message) } }

async function request(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  const method = (init.method || 'GET').toUpperCase()
  if (init.body) headers.set('Content-Type', 'application/json')
  if (method !== 'GET' && method !== 'HEAD') {
    if (!csrfToken) await ensureCsrf()
    if (csrfToken) headers.set('x-csrf-token', csrfToken)
  }
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, credentials: 'include' })
  if (response.status === 401) throw new UnauthorizedError('Authentication required')
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null
    throw new ApiError(response.status, body?.error || `API request failed (${response.status})`)
  }
  return response
}

export const ensureCsrf = async () => { const response = await request('/auth/csrf'); const body = await response.json() as { csrfToken?: string }; if (!body.csrfToken) throw new Error('CSRF token was not provided by the API'); csrfToken = body.csrfToken }
export const getCurrentUser = async (): Promise<AppUser | null> => { try { return (await (await request('/auth/me')).json() as { user: AppUser }).user } catch (error) { if (error instanceof UnauthorizedError) return null; throw error } }
export const loginUser = async (email: string, password: string): Promise<AppUser> => { await ensureCsrf(); const body = await (await request('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) })).json() as { user: AppUser; csrfToken: string }; csrfToken = body.csrfToken; return body.user }
export const getSetupStatus = async (): Promise<{ needsCeoSetup: boolean }> => (await (await request('/auth/setup-status')).json() as { needsCeoSetup: boolean })
export const createFirstCeo = async (name: string, email: string, password: string): Promise<AppUser> => { await ensureCsrf(); const body = await (await request('/auth/bootstrap-ceo', { method: 'POST', body: JSON.stringify({ name, email, password }) })).json() as { user: AppUser; csrfToken: string }; csrfToken = body.csrfToken; return body.user }
export const createTeamLead = async (name: string, email: string, password: string): Promise<AppUser> => { await ensureCsrf(); return (await (await request('/users', { method: 'POST', body: JSON.stringify({ name, email, password }) })).json() as { user: AppUser }).user }
export const logoutUser = async () => { await ensureCsrf(); await request('/auth/logout', { method: 'POST' }); csrfToken = '' }

export const api = (path = '', init: RequestInit = {}) => request(`/candidates${path}`, init)
export const readCandidateCache = (): Candidate[] => { try { const value = JSON.parse(localStorage.getItem(CANDIDATES_CACHE_KEY) || '[]'); return Array.isArray(value) ? value : [] } catch { return [] } }
export const cacheCandidateList = (items: Candidate[]): boolean => { try { localStorage.setItem(CANDIDATES_CACHE_KEY, JSON.stringify(items)); return true } catch { return false } }
export const hasMigratedLocalCandidates = () => { try { return localStorage.getItem(LOCAL_MIGRATION_KEY) === 'true' } catch { return false } }
export const markLocalCandidatesMigrated = () => { try { localStorage.setItem(LOCAL_MIGRATION_KEY, 'true') } catch { /* best effort */ } }

export const upsertInBatches = async (items: Candidate[]) => {
  let batch: Candidate[] = []; let size = 0; let latest: Candidate[] = []
  const flush = async () => { if (!batch.length) return; latest = await (await api('', { method: 'PUT', body: JSON.stringify(batch) })).json() as Candidate[]; batch = []; size = 0 }
  for (const item of items) { const itemSize = JSON.stringify(item).length; if (size + itemSize > 3_000_000) await flush(); batch.push(item); size += itemSize }
  await flush(); return latest
}
