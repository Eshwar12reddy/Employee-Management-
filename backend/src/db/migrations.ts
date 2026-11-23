import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import type Database from 'better-sqlite3'

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations')

async function migrationFiles(driver: 'postgres' | 'sqlite'): Promise<Array<{ version: string; sql: string }>> {
  const names = (await readdir(migrationsDir)).filter(name => name.endsWith(`.${driver}.sql`)).sort()
  return Promise.all(names.map(async name => ({ version: name.slice(0, name.indexOf(`.${driver}.sql`)), sql: await readFile(path.join(migrationsDir, name), 'utf8') })))
}

export async function runPostgresMigrations(pool: Pool): Promise<void> {
  const lockClient = await pool.connect()
  try {
    await lockClient.query('SELECT pg_advisory_lock($1)', [271828])
    await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())')
    for (const migration of await migrationFiles('postgres')) {
      const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [migration.version])
      if (existing.rowCount) continue
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(migration.sql)
        await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [migration.version])
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK')
        throw error
      } finally {
        client.release()
      }
    }
  } finally {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [271828]).catch(() => undefined)
    lockClient.release()
  }
}

export async function runSqliteMigrations(db: Database.Database): Promise<void> {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  for (const migration of await migrationFiles('sqlite')) {
    const existing = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(migration.version)
    if (existing) continue
    const transaction = db.transaction(() => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(migration.version, new Date().toISOString())
    })
    transaction()
  }
}
