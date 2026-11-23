import { Pool } from 'pg'
import type { AppConfig } from '../config/environment.js'
import type { AuthRepository } from './auth-repository.js'
import type { CandidateRepository } from './candidate-repository.js'
import { runPostgresMigrations, runSqliteMigrations } from './migrations.js'
import { PostgresAuthRepository } from '../repositories/postgres-auth-repository.js'
import { PostgresCandidateRepository } from '../repositories/postgres-candidate-repository.js'
import { SqliteAuthRepository } from '../repositories/sqlite-auth-repository.js'
import { SqliteCandidateRepository } from '../repositories/sqlite-candidate-repository.js'

export type DatabaseResources = { candidates: CandidateRepository; auth: AuthRepository; close: () => Promise<void> }

export async function createRepository(config: AppConfig): Promise<DatabaseResources> {
  if (config.databaseDriver === 'postgres') {
    const pool = new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
    await runPostgresMigrations(pool)
    const candidates = new PostgresCandidateRepository(pool)
    return { candidates, auth: new PostgresAuthRepository(pool), close: () => candidates.close() }
  }

  const candidates = await SqliteCandidateRepository.create(config.sqlitePath)
  await candidates.migrate(runSqliteMigrations)
  const auth = new SqliteAuthRepository(config.sqlitePath)
  return { candidates, auth, close: async () => { await auth.close(); await candidates.close() } }
}
