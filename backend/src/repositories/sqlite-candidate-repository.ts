import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Actor, Candidate, CandidateRepository } from '../db/candidate-repository.js'
import { CandidatePermissionError } from '../db/candidate-repository.js'

type CandidateRow = { payload: string; updated_at: string; updated_by_id: string | null; updated_by_name: string | null; updated_by_email: string | null; updated_by_role: Actor['role'] | null }
const listSql = `SELECT c.payload, c.updated_at, u.id AS updated_by_id, u.name AS updated_by_name, u.email AS updated_by_email, u.role AS updated_by_role
  FROM candidates c LEFT JOIN users u ON u.id = c.updated_by_user_id ORDER BY c.updated_at DESC`
const withMetadata = (row: CandidateRow): Candidate => ({
  ...(JSON.parse(row.payload) as Candidate),
  updatedAt: (JSON.parse(row.payload) as Candidate).updatedAt || row.updated_at,
  ...(row.updated_by_id ? { lastUpdatedBy: { id: row.updated_by_id, name: row.updated_by_name || '', email: row.updated_by_email || '', role: row.updated_by_role || 'TEAM_LEAD' } } : {}),
})

export class SqliteCandidateRepository implements CandidateRepository {
  private readonly db: Database.Database
  constructor(private readonly filename: string) { this.db = new Database(filename); this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON') }
  static async create(filename: string): Promise<SqliteCandidateRepository> { await mkdir(path.dirname(filename), { recursive: true }); return new SqliteCandidateRepository(filename) }
  async migrate(run: (db: Database.Database) => Promise<void>): Promise<void> { await run(this.db) }
  async list(_actor: Actor): Promise<Candidate[]> { return (this.db.prepare(listSql).all() as CandidateRow[]).map(withMetadata) }
  async get(id: string, _actor: Actor): Promise<Candidate | null> { const row = this.db.prepare(`${listSql.replace(' ORDER BY c.updated_at DESC', '')} WHERE c.id = ?`).get(id) as CandidateRow | undefined; return row ? withMetadata(row) : null }
  private ownerFor(id: string, actor: Actor): string | null {
    const row = this.db.prepare('SELECT owner_user_id FROM candidates WHERE id = ?').get(id) as { owner_user_id: string | null } | undefined
    if (actor.role === 'TEAM_LEAD' && row?.owner_user_id && row.owner_user_id !== actor.id) throw new CandidatePermissionError('You are not authorized to manage this candidate')
    return row?.owner_user_id || (actor.id === 'migration' ? null : actor.id)
  }
  async upsert(candidate: Candidate, actor: Actor): Promise<void> { const owner = this.ownerFor(candidate.id, actor); this.db.prepare(`INSERT INTO candidates (id, payload, updated_at, owner_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, owner_user_id = COALESCE(candidates.owner_user_id, excluded.owner_user_id), updated_by_user_id = excluded.updated_by_user_id`).run(candidate.id, JSON.stringify(candidate), candidate.updatedAt, owner, actor.id) }
  async upsertMany(candidates: Candidate[], actor: Actor): Promise<void> { const statement = this.db.prepare(`INSERT INTO candidates (id, payload, updated_at, owner_user_id, updated_by_user_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at, owner_user_id = COALESCE(candidates.owner_user_id, excluded.owner_user_id), updated_by_user_id = excluded.updated_by_user_id`); const transaction = this.db.transaction((items: Candidate[]) => { for (const candidate of items) { const owner = this.ownerFor(candidate.id, actor); statement.run(candidate.id, JSON.stringify(candidate), candidate.updatedAt, owner, actor.id) } }); transaction(candidates) }
  async remove(id: string, actor: Actor): Promise<boolean> { this.ownerFor(id, actor); return this.db.prepare('DELETE FROM candidates WHERE id = ?').run(id).changes === 1 }
  async checkHealth(): Promise<void> { this.db.prepare('SELECT 1').get() }
  async close(): Promise<void> { this.db.close() }
}
