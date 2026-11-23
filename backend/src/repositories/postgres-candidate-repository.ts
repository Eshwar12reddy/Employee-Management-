import type { Pool } from 'pg'
import type { Candidate, CandidateRepository } from '../db/candidate-repository.js'

type CandidateRow = { payload: Candidate }

export class PostgresCandidateRepository implements CandidateRepository {
  constructor(private readonly pool: Pool) {}

  async list(): Promise<Candidate[]> {
    const result = await this.pool.query<CandidateRow>('SELECT payload FROM candidates ORDER BY updated_at DESC')
    return result.rows.map(row => row.payload)
  }

  async get(id: string): Promise<Candidate | null> {
    const result = await this.pool.query<CandidateRow>('SELECT payload FROM candidates WHERE id = $1', [id])
    return result.rows[0]?.payload || null
  }

  async upsert(candidate: Candidate): Promise<void> {
    await this.pool.query(
      `INSERT INTO candidates (id, payload, updated_at) VALUES ($1, $2::jsonb, $3::timestamptz)
       ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
      [candidate.id, JSON.stringify(candidate), candidate.updatedAt],
    )
  }

  async upsertMany(candidates: Candidate[]): Promise<void> {
    if (!candidates.length) return
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      for (const candidate of candidates) {
        await client.query(
          `INSERT INTO candidates (id, payload, updated_at) VALUES ($1, $2::jsonb, $3::timestamptz)
           ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = EXCLUDED.updated_at`,
          [candidate.id, JSON.stringify(candidate), candidate.updatedAt],
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

  async remove(id: string): Promise<boolean> {
    const result = await this.pool.query('DELETE FROM candidates WHERE id = $1', [id])
    return result.rowCount === 1
  }

  async checkHealth(): Promise<void> {
    await this.pool.query('SELECT 1')
  }

  async close(): Promise<void> {
    await this.pool.end()
  }
}
