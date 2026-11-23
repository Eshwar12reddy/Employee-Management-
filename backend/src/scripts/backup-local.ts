import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { readConfig } from '../config/environment.js'
import { createRepository } from '../db/create-repository.js'

const config = readConfig()
const sqliteConfig = { ...config, databaseDriver: 'sqlite' as const, databaseUrl: '', sqlitePath: process.env.SQLITE_PATH || config.sqlitePath }
const repository = await createRepository(sqliteConfig)
const outputArg = process.argv.find(value => value.startsWith('--output='))?.slice('--output='.length)
const output = path.resolve(outputArg || `backups/candidates-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
const candidates = await repository.list()
await mkdir(path.dirname(output), { recursive: true })
await writeFile(output, JSON.stringify(candidates, null, 2), 'utf8')
await repository.close()
console.log(`Backed up ${candidates.length} candidate records to ${output}`)
