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
  appAccessKey: string
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
  const appAccessKey = process.env.APP_ACCESS_KEY || ''

  if (nodeEnv === 'production' && !databaseUrl) {
    throw new Error('DATABASE_URL is required in production; SQLite is local-development only')
  }
  if (nodeEnv === 'production' && !appAccessKey) {
    throw new Error('APP_ACCESS_KEY is required in production')
  }

  return {
    port: Number(process.env.PORT || 3001),
    nodeEnv,
    databaseDriver,
    databaseUrl,
    sqlitePath: path.resolve(process.env.SQLITE_PATH || 'data/candidates.sqlite'),
    frontendOrigin: process.env.FRONTEND_ORIGIN || 'http://localhost:5173',
    appAccessKey,
    allowInsecureLocal: nodeEnv !== 'production' && process.env.ALLOW_INSECURE_LOCAL !== 'false',
    jsonBodyLimit: process.env.JSON_BODY_LIMIT || '4mb',
    sessionTtlHours: Number(process.env.SESSION_TTL_HOURS || 12),
    cookieSecure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : nodeEnv === 'production',
    cookieSameSite: (process.env.COOKIE_SAME_SITE || (nodeEnv === 'production' ? 'none' : 'lax')) as CookieSameSite,
  }
}
