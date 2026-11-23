import { createApp } from './app.js'
import { readConfig } from './config/environment.js'
import { createRepository } from './db/create-repository.js'
import { CandidateService } from './services/candidate-service.js'
import { AuthService } from './services/auth-service.js'

const config = readConfig()
const database = await createRepository(config)
const app = createApp(config, new CandidateService(database.candidates), new AuthService(database.auth, config))
const server = app.listen(config.port, '0.0.0.0', () => {
  if (config.nodeEnv !== 'test') console.log(`Candidate API listening on port ${config.port}`)
})

const shutdown = async () => {
  server.close(async () => { await database.close(); process.exit(0) })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
