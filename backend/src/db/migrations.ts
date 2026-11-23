import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Pool } from 'pg'
import type Database from 'better-sqlite3'

const migrationsDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../migrations')

async function migrationFile(driver: 'postgres' | 'sqlite', version: string): Promise<string> {
  return readFile(path.join(migrationsDir, `${version}.${driver}.sql`), 'utf8')
}

export async function runPostgresMigrations(pool: Pool): Promise<void> {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())')
  const version = '001_create_candidates'
  const existing = await pool.query('SELECT 1 FROM schema_migrations WHERE version = $1', [version])
  if (!existing.rowCount) {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(await migrationFile('postgres', version))
      await client.query('INSERT INTO schema_migrations (version) VALUES ($1)', [version])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

export async function runSqliteMigrations(db: Database.Database): Promise<void> {
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)')
  const version = '001_create_candidates'
  const existing = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version)
  if (!existing) {
    const migration = await migrationFile('sqlite', version)
    const transaction = db.transaction(() => {
      db.exec(migration)
      db.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)').run(version, new Date().toISOString())
    })
    transaction()
  }
}
