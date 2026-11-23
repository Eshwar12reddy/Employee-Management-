import type { CandidateRepository, Candidate } from '../db/candidate-repository.js'

const MAX_ID_LENGTH = 200

export class CandidateValidationError extends Error {}

function candidateWithTimestamp(input: unknown): Candidate {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CandidateValidationError('Candidate must be a JSON object')
  }
  const candidate = input as Record<string, unknown>
  const id = typeof candidate.id === 'string' ? candidate.id.trim() : ''
  if (!id) throw new CandidateValidationError('Candidate id is required')
  if (id.length > MAX_ID_LENGTH) throw new CandidateValidationError('Candidate id is too long')

  const rawUpdatedAt = typeof candidate.updatedAt === 'string' ? candidate.updatedAt : ''
  const parsed = rawUpdatedAt ? Date.parse(rawUpdatedAt) : Number.NaN
  return { ...candidate, id, updatedAt: Number.isNaN(parsed) ? new Date().toISOString() : new Date(parsed).toISOString() } as Candidate
}

export class CandidateService {
  constructor(private readonly repository: CandidateRepository) {}

  list() { return this.repository.list() }
  get(id: string) { return this.repository.get(id) }
  remove(id: string) { return this.repository.remove(id) }

  async save(input: unknown): Promise<Candidate> {
    const candidate = candidateWithTimestamp(input)
    await this.repository.upsert(candidate)
    return candidate
  }

  async bulkSave(input: unknown): Promise<Candidate[]> {
    if (!Array.isArray(input)) throw new CandidateValidationError('Bulk upsert requires an array')
    const candidates = input.map(candidateWithTimestamp)
    await this.repository.upsertMany(candidates)
    return this.repository.list()
  }

  health() { return this.repository.checkHealth() }
}
