import type { Pool } from 'pg'
import type { AuthRepository, SessionRecord, StoredUser, User } from '../db/auth-repository.js'
import type { UserRole } from '../db/candidate-repository.js'

type UserRow = { id: string; email: string; name: string; role: UserRole; password_hash: string; disabled: boolean }

const toStoredUser = (row: UserRow): StoredUser => ({ id: row.id, email: row.email, name: row.name, role: row.role, passwordHash: row.password_hash, disabled: row.disabled })

export class PostgresAuthRepository implements AuthRepository {
  constructor(private readonly pool: Pool) {}

  async findUserByEmail(email: string): Promise<StoredUser | null> {
    const result = await this.pool.query<UserRow>('SELECT id, email, name, role, password_hash, disabled FROM users WHERE LOWER(email) = LOWER($1)', [email])
    return result.rows[0] ? toStoredUser(result.rows[0]) : null
  }

  async findUserById(id: string): Promise<StoredUser | null> {
    const result = await this.pool.query<UserRow>('SELECT id, email, name, role, password_hash, disabled FROM users WHERE id = $1', [id])
    return result.rows[0] ? toStoredUser(result.rows[0]) : null
  }

  async createUser(user: StoredUser): Promise<User> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO users (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, password_hash, disabled`,
      [user.id, user.email, user.name, user.role, user.passwordHash],
    )
    return toStoredUser(result.rows[0])
  }

  async createFirstUser(user: StoredUser): Promise<User | null> {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SELECT pg_advisory_xact_lock($1)', [846271])
      const existing = await client.query('SELECT 1 FROM users LIMIT 1')
      if (existing.rowCount) { await client.query('COMMIT'); return null }
      const result = await client.query<UserRow>(
        `INSERT INTO users (id, email, name, role, password_hash) VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role, password_hash, disabled`,
        [user.id, user.email, user.name, user.role, user.passwordHash],
      )
      await client.query('COMMIT')
      return toStoredUser(result.rows[0])
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally { client.release() }
  }

  async createSession(session: { tokenHash: string; csrfTokenHash: string; userId: string; expiresAt: string }): Promise<void> {
    await this.pool.query('INSERT INTO sessions (token_hash, user_id, csrf_token_hash, expires_at) VALUES ($1, $2, $3, $4)', [session.tokenHash, session.userId, session.csrfTokenHash, session.expiresAt])
  }

  async findSession(tokenHash: string): Promise<SessionRecord | null> {
    const result = await this.pool.query<{ token_hash: string; csrf_token_hash: string; expires_at: Date; id: string; email: string; name: string; role: UserRole }>(
      `SELECT s.token_hash, s.csrf_token_hash, s.expires_at, u.id, u.email, u.name, u.role
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = $1 AND s.expires_at > NOW() AND u.disabled = FALSE`, [tokenHash],
    )
    const row = result.rows[0]
    return row ? { tokenHash: row.token_hash, csrfTokenHash: row.csrf_token_hash, expiresAt: row.expires_at.toISOString(), user: { id: row.id, email: row.email, name: row.name, role: row.role } } : null
  }

  async touchSession(tokenHash: string): Promise<void> { await this.pool.query('UPDATE sessions SET last_seen_at = NOW() WHERE token_hash = $1', [tokenHash]) }
  async deleteSession(tokenHash: string): Promise<void> { await this.pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]) }
  async countUsersByRole(role: UserRole): Promise<number> { const result = await this.pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users WHERE role = $1', [role]); return Number(result.rows[0]?.count || 0) }
  async countUsers(): Promise<number> { const result = await this.pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM users'); return Number(result.rows[0]?.count || 0) }
  async checkHealth(): Promise<void> { await this.pool.query('SELECT 1') }
  async close(): Promise<void> { /* shared pool is closed by the candidate repository */ }
}
