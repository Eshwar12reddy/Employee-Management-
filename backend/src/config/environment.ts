import 'dotenv/config'
import path from 'node:path'

export type DatabaseDriver = 'postgres' | 'sqlite'

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
}

export function readConfig(): AppConfig {
  const nodeEnv = process.env.NODE_ENV || 'development'
  const databaseUrl = process.env.DATABASE_URL || ''
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
  }
}
