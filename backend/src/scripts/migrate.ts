import { readConfig } from '../config/environment.js'
import { createRepository } from '../db/create-repository.js'

const repository = await createRepository(readConfig())
await repository.close()
console.log('Database migrations are up to date.')
