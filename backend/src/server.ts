import { createApp } from './app.js'
import { readConfig } from './config/environment.js'
import { createRepository } from './db/create-repository.js'
import { CandidateService } from './services/candidate-service.js'
import { AuthService } from './services/auth-service.js'
import type { DatabaseResources } from './db/create-repository.js'

const config = readConfig()
let database: DatabaseResources
try {
  database = await createRepository(config)
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'unknown'
  const category = ['ENOTFOUND', 'EAI_AGAIN'].includes(code) ? 'dns' : ['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code) ? 'network' : ['28P01', '28000'].includes(code) ? 'authentication' : code === '3D000' ? 'database-not-found' : 'query-or-migration'
  console.error(`[startup] database initialization failed (${category}; code=${code})`)
  process.exit(1)
}
const app = createApp(config, new CandidateService(database.candidates), new AuthService(database.auth, config))
const server = app.listen(config.port, '0.0.0.0', () => {
  if (config.nodeEnv !== 'test') console.log(`Candidate API listening on port ${config.port}`)
})

const shutdown = async () => {
  server.close(async () => { await database.close(); process.exit(0) })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
