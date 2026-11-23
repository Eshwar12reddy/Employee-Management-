import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import Database from 'better-sqlite3'
import type { Candidate, CandidateRepository } from '../db/candidate-repository.js'

export class SqliteCandidateRepository implements CandidateRepository {
  private readonly db: Database.Database

  constructor(private readonly filename: string) {
    this.db = new Database(filename)
    this.db.pragma('journal_mode = WAL')
  }

  static async create(filename: string): Promise<SqliteCandidateRepository> {
    await mkdir(path.dirname(filename), { recursive: true })
    return new SqliteCandidateRepository(filename)
  }

  async migrate(run: (db: Database.Database) => Promise<void>): Promise<void> {
    await run(this.db)
  }

  async list(): Promise<Candidate[]> {
    const rows = this.db.prepare('SELECT payload FROM candidates ORDER BY updated_at DESC').all() as Array<{ payload: string }>
    return rows.map(row => JSON.parse(row.payload) as Candidate)
  }

  async get(id: string): Promise<Candidate | null> {
    const row = this.db.prepare('SELECT payload FROM candidates WHERE id = ?').get(id) as { payload: string } | undefined
    return row ? JSON.parse(row.payload) as Candidate : null
  }

  async upsert(candidate: Candidate): Promise<void> {
    this.db.prepare(`INSERT INTO candidates (id, payload, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
      .run(candidate.id, JSON.stringify(candidate), candidate.updatedAt)
  }

  async upsertMany(candidates: Candidate[]): Promise<void> {
    const statement = this.db.prepare(`INSERT INTO candidates (id, payload, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
    const transaction = this.db.transaction((items: Candidate[]) => {
      for (const candidate of items) statement.run(candidate.id, JSON.stringify(candidate), candidate.updatedAt)
    })
    transaction(candidates)
  }

  async remove(id: string): Promise<boolean> {
    return this.db.prepare('DELETE FROM candidates WHERE id = ?').run(id).changes === 1
  }

  async checkHealth(): Promise<void> {
    this.db.prepare('SELECT 1').get()
  }

  async close(): Promise<void> {
    this.db.close()
  }
}
