import type { Pool, PoolClient } from 'pg'
import type { Actor, Candidate, CandidateRepository } from '../db/candidate-repository.js'
import { CandidatePermissionError } from '../db/candidate-repository.js'

type CandidateRow = { payload: Candidate; updated_at: Date; updated_by_id: string | null; updated_by_name: string | null; updated_by_email: string | null; updated_by_role: Actor['role'] | null }

const withMetadata = (row: CandidateRow): Candidate => ({
  ...row.payload,
  updatedAt: row.payload.updatedAt || row.updated_at.toISOString(),
  ...(row.updated_by_id ? { lastUpdatedBy: { id: row.updated_by_id, name: row.updated_by_name || '', email: row.updated_by_email || '', role: row.updated_by_role || 'TEAM_LEAD' } } : {}),
})

const listSql = `SELECT c.payload, c.updated_at, u.id AS updated_by_id, u.name AS updated_by_name, u.email AS updated_by_email, u.role AS updated_by_role
  FROM candidates c LEFT JOIN users u ON u.id = c.updated_by_user_id ORDER BY c.updated_at DESC`

export class PostgresCandidateRepository implements CandidateRepository {
  constructor(private readonly pool: Pool) {}

  async list(_actor: Actor): Promise<Candidate[]> {
    const result = await this.pool.query<CandidateRow>(listSql)
    return result.rows.map(withMetadata)
  }

  async get(id: string, _actor: Actor): Promise<Candidate | null> {
    const result = await this.pool.query<CandidateRow>(`${listSql.replace(' ORDER BY c.updated_at DESC', '')} WHERE c.id = $1`, [id])
    return result.rows[0] ? withMetadata(result.rows[0]) : null
  }

  private async ownerFor(id: string, actor: Actor, client: Pool | PoolClient = this.pool): Promise<string | null> {
    const result = await client.query<{ owner_user_id: string | null }>('SELECT owner_user_id FROM candidates WHERE id = $1', [id])
    const owner = result.rows[0]?.owner_user_id
    if (actor.role === 'TEAM_LEAD' && owner && owner !== actor.id) throw new CandidatePermissionError('You are not authorized to manage this candidate')
    return owner || (actor.id === 'migration' ? null : actor.id)
  }

  async upsert(candidate: Candidate, actor: Actor): Promise<void> {
    const owner = await this.ownerFor(candidate.id, actor)
    await this.pool.query(
      `INSERT INTO candidates (id, payload, updated_at, owner_user_id, updated_by_user_id) VALUES ($1, $2::jsonb, $3::timestamptz, $4, $5)
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at, owner_user_id = COALESCE(candidates.owner_user_id, EXCLUDED.owner_user_id), updated_by_user_id = EXCLUDED.updated_by_user_id`,
      [candidate.id, JSON.stringify(candidate), candidate.updatedAt, owner, actor.id],
    )
  }

  async upsertMany(candidates: Candidate[], actor: Actor): Promise<void> {
    if (!candidates.length) return
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (const candidate of candidates) {
        const owner = await this.ownerFor(candidate.id, actor, client)
        await client.query(
          `INSERT INTO candidates (id, payload, updated_at, owner_user_id, updated_by_user_id) VALUES ($1, $2::jsonb, $3::timestamptz, $4, $5)
          ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at, owner_user_id = COALESCE(candidates.owner_user_id, EXCLUDED.owner_user_id), updated_by_user_id = EXCLUDED.updated_by_user_id`,
          [candidate.id, JSON.stringify(candidate), candidate.updatedAt, owner, actor.id],
        )
      }
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async remove(id: string, actor: Actor): Promise<boolean> {
    await this.ownerFor(id, actor)
    const result = await this.pool.query('DELETE FROM candidates WHERE id = $1', [id])
    return result.rowCount === 1
  }

  async checkHealth(): Promise<void> { await this.pool.query('SELECT 1') }
  async close(): Promise<void> { await this.pool.end() }
}
