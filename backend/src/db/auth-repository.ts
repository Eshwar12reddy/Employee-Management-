import type { UserRole } from './candidate-repository.js'

export type User = { id: string; email: string; name: string; role: UserRole }
export type StoredUser = User & { passwordHash: string; disabled: boolean }
export type SessionRecord = { tokenHash: string; csrfTokenHash: string; expiresAt: string; user: User }

export interface AuthRepository {
  findUserByEmail(email: string): Promise<StoredUser | null>
  findUserById(id: string): Promise<StoredUser | null>
  createUser(user: StoredUser): Promise<User>
  createFirstUser(user: StoredUser): Promise<User | null>
  createSession(session: { tokenHash: string; csrfTokenHash: string; userId: string; expiresAt: string }): Promise<void>
  findSession(tokenHash: string): Promise<SessionRecord | null>
  touchSession(tokenHash: string): Promise<void>
  deleteSession(tokenHash: string): Promise<void>
  countUsersByRole(role: UserRole): Promise<number>
  countUsers(): Promise<number>
  checkHealth(): Promise<void>
  close(): Promise<void>
}
