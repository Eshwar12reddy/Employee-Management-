import 'dotenv/config'
import path from 'node:path'

export type DatabaseDriver = 'postgres' | 'sqlite'
export type CookieSameSite = 'lax' | 'strict' | 'none'

export type AppConfig = {
  port: number
  nodeEnv: string
  databaseDriver: DatabaseDriver
  databaseUrl: string
  sqlitePath: string
  frontendOrigin: string
  allowInsecureLocal: boolean
  jsonBodyLimit: string
  sessionTtlHours: number
  cookieSecure: boolean
  cookieSameSite: CookieSameSite
}

export function readConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const databaseUrl = (process.env.DATABASE_URL || '').trim()
  const databaseDriver: DatabaseDriver = databaseUrl ? 'postgres' : 'sqlite'

  if (nodeEnv === 'production' && !databaseUrl) {
    throw new Error('DATABASE_URL is required in production; SQLite is local-development only')
  }
  if (databaseUrl) {
    let parsed: URL
    try { parsed = new URL(databaseUrl) } catch { throw new Error('DATABASE_URL is invalid: expected a PostgreSQL connection URL') }
    if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname || !parsed.pathname.slice(1)) {
      throw new Error('DATABASE_URL is invalid: expected a PostgreSQL connection URL with host and database name')
    }
  }

  const frontendOrigin = (process.env.FRONTEND_ORIGIN || '').trim()
  if (nodeEnv === 'production' && !frontendOrigin) {
    throw new Error('FRONTEND_ORIGIN is required in production')
  }
  if (nodeEnv === 'production') {
    let parsed: URL
    try { parsed = new URL(frontendOrigin) } catch { throw new Error('FRONTEND_ORIGIN is invalid: expected an origin such as https://frontend.example.com') }
    if (parsed.protocol !== 'https:' || parsed.origin !== frontendOrigin || parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
      throw new Error('FRONTEND_ORIGIN must be the exact HTTPS frontend origin without a path or localhost fallback')
    }
  }

  return {
    port: Number(process.env.PORT || 3001),
    nodeEnv,
    databaseDriver,
    databaseUrl,
    sqlitePath: path.resolve(process.env.SQLITE_PATH || 'data/candidates.sqlite'),
    frontendOrigin: frontendOrigin || 'http://localhost:5173',
    allowInsecureLocal: nodeEnv !== 'production' && process.env.ALLOW_INSECURE_LOCAL !== 'false',
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || '4mb',
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
    cookieSameSite: (process.env.COOKIE_SAME_SITE || (nodeEnv === 'production' ? 'none' : 'lax')) as CookieSameSite,
  }
}
