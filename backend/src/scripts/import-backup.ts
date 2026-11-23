import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { readConfig } from '../config/environment.js'
import { createRepository } from '../db/create-repository.js'

const fileArg = process.argv.find(value => value.startsWith('--file='))?.slice('--file='.length)
if (!fileArg) throw new Error('Provide a backup with --file=path/to/candidates.json')
const onDuplicate = process.argv.find(value => value.startsWith('--on-duplicate='))?.slice('--on-duplicate='.length) || 'update'
if (!['update', 'skip'].includes(onDuplicate)) throw new Error('--on-duplicate must be update or skip')

const parsed: unknown = JSON.parse(await readFile(path.resolve(fileArg), 'utf8'))
if (!Array.isArray(parsed)) throw new Error('Backup must contain a JSON array')
const config = readConfig()
const repository = await createRepository(config)
const before = (await repository.list()).length
const candidates = parsed.filter((candidate): candidate is Record<string, unknown> => !!candidate && typeof candidate === 'object' && typeof (candidate as Record<string, unknown>).id === 'string')
const toImport = []
let skipped = 0
for (const candidate of candidates) {
  if (onDuplicate === 'skip' && await repository.get(String(candidate.id))) { skipped++; continue }
  toImport.push({ ...candidate, updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : new Date().toISOString() } as { id: string; updatedAt: string; [key: string]: unknown })
}
await repository.upsertMany(toImport)
const after = (await repository.list()).length
await repository.close()
console.log(`Imported ${toImport.length} records; skipped ${skipped}; row count ${before} -> ${after}.`)
