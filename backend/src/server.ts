import { createApp } from './app.js'
import { readConfig } from './config/environment.js'
import { createRepository } from './db/create-repository.js'
import { CandidateService } from './services/candidate-service.js'

const config = readConfig()
const repository = await createRepository(config)
const app = createApp(config, new CandidateService(repository))
const server = app.listen(config.port, '0.0.0.0', () => {
  if (config.nodeEnv !== 'test') console.log(`Candidate API listening on port ${config.port}`)
})

const shutdown = async () => {
  server.close(async () => { await repository.close(); process.exit(0) })
}
process.once('SIGTERM', shutdown)
process.once('SIGINT', shutdown)
