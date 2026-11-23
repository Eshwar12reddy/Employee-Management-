import Database from 'better-sqlite3'
import type { AuthRepository, SessionRecord, StoredUser, User } from '../db/auth-repository.js'
import type { UserRole } from '../db/candidate-repository.js'

type UserRow = { id: string; email: string; name: string; role: UserRole; password_hash: string; disabled: number }
const toStoredUser = (row: UserRow): StoredUser => ({ id: row.id, email: row.email, name: row.name, role: row.role, passwordHash: row.password_hash, disabled: row.disabled === 1 })

export class SqliteAuthRepository implements AuthRepository {
  private readonly db: Database.Database
  constructor(filename: string) { this.db = new Database(filename); this.db.pragma('journal_mode = WAL'); this.db.pragma('foreign_keys = ON') }
  async findUserByEmail(email: string): Promise<StoredUser | null> { const row = this.db.prepare('SELECT id, email, name, role, password_hash, disabled FROM users WHERE LOWER(email) = LOWER(?)').get(email) as UserRow | undefined; return row ? toStoredUser(row) : null }
  async findUserById(id: string): Promise<StoredUser | null> { const row = this.db.prepare('SELECT id, email, name, role, password_hash, disabled FROM users WHERE id = ?').get(id) as UserRow | undefined; return row ? toStoredUser(row) : null }
  async createUser(user: StoredUser): Promise<User> { this.db.prepare('INSERT INTO users (id, email, name, role, password_hash, disabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)').run(user.id, user.email, user.name, user.role, user.passwordHash, new Date().toISOString(), new Date().toISOString()); return { id: user.id, email: user.email, name: user.name, role: user.role } }
  async createSession(session: { tokenHash: string; csrfTokenHash: string; userId: string; expiresAt: string }): Promise<void> { const now = new Date().toISOString(); this.db.prepare('INSERT INTO sessions (token_hash, user_id, csrf_token_hash, expires_at, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)').run(session.tokenHash, session.userId, session.csrfTokenHash, session.expiresAt, now, now) }
  async findSession(tokenHash: string): Promise<SessionRecord | null> { const row = this.db.prepare(`SELECT s.token_hash, s.csrf_token_hash, s.expires_at, u.id, u.email, u.name, u.role FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND u.disabled = 0`).get(tokenHash, new Date().toISOString()) as { token_hash: string; csrf_token_hash: string; expires_at: string; id: string; email: string; name: string; role: UserRole } | undefined; return row ? { tokenHash: row.token_hash, csrfTokenHash: row.csrf_token_hash, expiresAt: row.expires_at, user: { id: row.id, email: row.email, name: row.name, role: row.role } } : null }
  async touchSession(tokenHash: string): Promise<void> { this.db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?').run(new Date().toISOString(), tokenHash) }
  async deleteSession(tokenHash: string): Promise<void> { this.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(tokenHash) }
  async countUsersByRole(role: UserRole): Promise<number> { const row = this.db.prepare('SELECT COUNT(*) AS count FROM users WHERE role = ?').get(role) as { count: number }; return row.count }
  async checkHealth(): Promise<void> { this.db.prepare('SELECT 1').get() }
  async close(): Promise<void> { this.db.close() }
}
