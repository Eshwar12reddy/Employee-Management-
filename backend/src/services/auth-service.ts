import bcrypt from 'bcryptjs'
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { AppConfig } from '../config/environment.js'
import type { AuthRepository, SessionRecord, User } from '../db/auth-repository.js'
import type { UserRole } from '../db/candidate-repository.js'

export class AuthError extends Error {}
export type AuthContext = { user: User; session: SessionRecord }

const normalizeEmail = (email: string) => email.trim().toLowerCase()
const hashToken = (value: string) => createHash('sha256').update(value).digest('hex')
const equalSecret = (left: string, right: string) => { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b) }

export class AuthService {
  constructor(private readonly repository: AuthRepository, private readonly config: AppConfig) {}

  async createUser(input: { email: string; name: string; password: string; role: UserRole; allowCeoBootstrap?: boolean }): Promise<User> {
    const email = normalizeEmail(input.email)
    const name = input.name.trim()
    if (!email || !email.includes('@')) throw new AuthError('A valid email is required')
    if (!name) throw new AuthError('A name is required')
    if (input.password.length < 12) throw new AuthError('Password must be at least 12 characters')
    if (input.role === 'CEO' && !input.allowCeoBootstrap) throw new AuthError('CEO accounts can only be created by the secure first-account provisioning flow')
    const storedUser = { id: randomUUID(), email, name, role: input.role, passwordHash: await bcrypt.hash(input.password, 12), disabled: false }
    try {
      if (input.role === 'CEO') {
        const first = await this.repository.createFirstUser(storedUser)
        if (!first) throw new AuthError('CEO accounts can only be created by the secure first-account provisioning flow')
        return first
      }
      return await this.repository.createUser(storedUser)
    } catch (error) {
      if (error instanceof AuthError) throw error
      throw new AuthError('Unable to create account; the email may already be provisioned')
    }
  }

  async login(email: string, password: string): Promise<{ user: User; sessionToken: string; csrfToken: string; expiresAt: string }> {
    const user = await this.repository.findUserByEmail(normalizeEmail(email))
    if (!user || user.disabled || !(await bcrypt.compare(password, user.passwordHash))) throw new AuthError('Email or password is incorrect')
    const sessionToken = randomBytes(32).toString('base64url')
    const csrfToken = randomBytes(32).toString('base64url')
    const expiresAt = new Date(Date.now() + this.config.sessionTtlHours * 60 * 60 * 1000).toISOString()
    await this.repository.createSession({ tokenHash: hashToken(sessionToken), csrfTokenHash: hashToken(csrfToken), userId: user.id, expiresAt })
    return { user: { id: user.id, email: user.email, name: user.name, role: user.role }, sessionToken, csrfToken, expiresAt }
  }

  async needsCeoBootstrap(): Promise<boolean> { return (await this.repository.countUsers()) === 0 }

  async bootstrapCeo(email: string, name: string, password: string) {
    await this.createUser({ email, name, password, role: 'CEO', allowCeoBootstrap: true })
    return this.login(email, password)
  }

  async authenticate(sessionToken: string | undefined): Promise<AuthContext | null> {
    if (!sessionToken) return null
    const session = await this.repository.findSession(hashToken(sessionToken))
    if (!session) return null
    await this.repository.touchSession(session.tokenHash)
    return { user: session.user, session }
  }

  async logout(sessionToken: string | undefined): Promise<void> { if (sessionToken) await this.repository.deleteSession(hashToken(sessionToken)) }
  async health(): Promise<void> { await this.repository.checkHealth() }
  verifyCsrf(session: SessionRecord, cookieToken: string | undefined, headerToken: string | undefined): boolean { return !!cookieToken && !!headerToken && equalSecret(cookieToken, headerToken) && equalSecret(hashToken(headerToken), session.csrfTokenHash) }
  verifyPreAuthCsrf(cookieToken: string | undefined, headerToken: string | undefined): boolean { return !!cookieToken && !!headerToken && equalSecret(cookieToken, headerToken) }
}
