import assert from 'node:assert/strict'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AppConfig } from '../config/environment.js'
import { createApp } from '../app.js'
import { createRepository } from '../db/create-repository.js'
import { CandidateService } from '../services/candidate-service.js'
import { AuthService } from '../services/auth-service.js'

type Jar = Map<string, string>

const configFor = (sqlitePath: string): AppConfig => ({
  port: 0,
  nodeEnv: 'test',
  databaseDriver: 'sqlite',
  databaseUrl: '',
  sqlitePath,
  frontendOrigin: 'http://localhost:5173',
  appAccessKey: 'legacy-test-key',
  allowInsecureLocal: true,
  jsonBodyLimit: '4mb',
  sessionTtlHours: 12,
  cookieSecure: false,
  cookieSameSite: 'lax',
})

function rememberCookies(response: Response, jar: Jar) {
  const setCookie = response.headers.get('set-cookie') || ''
  for (const match of setCookie.matchAll(/(?:^|,\s*)(ems_[^=]+)=([^;]*)/g)) jar.set(match[1], match[2])
}

async function request(baseUrl: string, pathName: string, jar: Jar, init: RequestInit = {}) {
  const headers = new Headers(init.headers)
  if (init.body) headers.set('Content-Type', 'application/json')
  const cookie = [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ')
  if (cookie) headers.set('Cookie', cookie)
  const response = await fetch(`${baseUrl}${pathName}`, { ...init, headers })
  rememberCookies(response, jar)
  return { response, body: await response.json().catch(() => null) as unknown }
}

async function login(baseUrl: string, email: string, password: string): Promise<Jar> {
  const jar: Jar = new Map()
  const csrf = await request(baseUrl, '/api/auth/csrf', jar)
  assert.equal(csrf.response.status, 200)
  const result = await request(baseUrl, '/api/auth/login', jar, { method: 'POST', headers: { 'x-csrf-token': jar.get('ems_csrf') || '' }, body: JSON.stringify({ email, password }) })
  assert.equal(result.response.status, 200)
  return jar
}

const candidate = (id: string, name: string) => ({ id, name, designation: 'AI Intern', updatedAt: new Date().toISOString() })

const tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'clyptus-auth-smoke-'))
const database = await createRepository(configFor(path.join(tempDirectory, 'candidates.sqlite')))
const auth = new AuthService(database.auth, configFor(path.join(tempDirectory, 'candidates.sqlite')))
const candidates = new CandidateService(database.candidates)
const app = createApp(configFor(path.join(tempDirectory, 'candidates.sqlite')), candidates, auth)
const server = createServer(app)

try {
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Smoke test server did not bind to a TCP port')
  const baseUrl = `http://127.0.0.1:${address.port}`
  assert.equal((await request(baseUrl, '/api/health', new Map())).response.status, 200)

  await auth.createUser({ email: 'ceo@example.test', name: 'CEO', password: 'Correct-Horse-Battery-CEO', role: 'CEO', allowCeoBootstrap: true })
  await auth.createUser({ email: 'lead@example.test', name: 'Team Lead', password: 'Correct-Horse-Battery-Lead', role: 'TEAM_LEAD' })
  await assert.rejects(() => auth.createUser({ email: 'second-ceo@example.test', name: 'Second CEO', password: 'Correct-Horse-Battery-CEO', role: 'CEO', allowCeoBootstrap: true }))

  const leadJar = await login(baseUrl, 'lead@example.test', 'Correct-Horse-Battery-Lead')
  const first = await request(baseUrl, '/api/candidates', leadJar, { method: 'POST', headers: { 'x-csrf-token': leadJar.get('ems_csrf') || '' }, body: JSON.stringify(candidate('candidate-a', 'Candidate A')) })
  assert.equal(first.response.status, 201)

  const imported = await request(baseUrl, '/api/candidates', leadJar, { method: 'PUT', headers: { 'x-csrf-token': leadJar.get('ems_csrf') || '' }, body: JSON.stringify([candidate('candidate-b', 'Candidate B')]) })
  assert.equal(imported.response.status, 200)
  assert.equal((imported.body as unknown[]).length, 2)

  const ceoJar = await login(baseUrl, 'ceo@example.test', 'Correct-Horse-Battery-CEO')
  const visible = await request(baseUrl, '/api/candidates', ceoJar)
  assert.equal(visible.response.status, 200)
  assert.deepEqual(new Set((visible.body as Array<{ id: string }>).map(item => item.id)), new Set(['candidate-a', 'candidate-b']))
  const forbidden = await request(baseUrl, '/api/candidates', ceoJar, { method: 'POST', headers: { 'x-csrf-token': ceoJar.get('ems_csrf') || '' }, body: JSON.stringify(candidate('candidate-c', 'Candidate C')) })
  assert.equal(forbidden.response.status, 403)

  const logout = await request(baseUrl, '/api/auth/logout', ceoJar, { method: 'POST', headers: { 'x-csrf-token': ceoJar.get('ems_csrf') || '' } })
  assert.equal(logout.response.status, 204)
  assert.equal((await request(baseUrl, '/api/auth/me', ceoJar)).response.status, 401)
  console.log('Auth smoke test passed: health, account provisioning, login, role enforcement, save/import persistence, CEO visibility, and logout')
} finally {
  await new Promise<void>(resolve => server.close(() => resolve()))
  await database.close()
  await rm(tempDirectory, { recursive: true, force: true })
}
