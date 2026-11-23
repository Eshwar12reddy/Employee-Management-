import { readConfig } from '../config/environment.js'
import { createRepository } from '../db/create-repository.js'

const database = await createRepository(readConfig())
await database.close()
console.log('Database migrations are up to date.')
