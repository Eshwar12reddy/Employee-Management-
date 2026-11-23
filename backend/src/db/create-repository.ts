import { Pool } from 'pg'
import type { AppConfig } from '../config/environment.js'
import type { CandidateRepository } from './candidate-repository.js'
import { runPostgresMigrations, runSqliteMigrations } from './migrations.js'
import { PostgresCandidateRepository } from '../repositories/postgres-candidate-repository.js'
import { SqliteCandidateRepository } from '../repositories/sqlite-candidate-repository.js'

export async function createRepository(config: AppConfig): Promise<CandidateRepository> {
  if (config.databaseDriver === 'postgres') {
    const pool = new Pool({ connectionString: config.databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 10_000 })
    await runPostgresMigrations(pool)
    return new PostgresCandidateRepository(pool)
  }

  const repository = await SqliteCandidateRepository.create(config.sqlitePath)
  await repository.migrate(runSqliteMigrations)
  return repository
}
