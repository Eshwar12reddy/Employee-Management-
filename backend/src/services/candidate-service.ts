import type { Actor, CandidateRepository, Candidate } from '../db/candidate-repository.js'
import { CandidatePermissionError } from '../db/candidate-repository.js'

const MAX_ID_LENGTH = 200

export class CandidateValidationError extends Error {}
export { CandidatePermissionError }

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

  list(actor: Actor) { return this.repository.list(actor) }
  get(id: string, actor: Actor) { return this.repository.get(id, actor) }
  remove(id: string, actor: Actor) {
    if (actor.role !== 'TEAM_LEAD') throw new CandidatePermissionError('Only Team Leads can delete candidates')
    return this.repository.remove(id, actor)
  }

  async save(input: unknown, actor: Actor): Promise<Candidate> {
    if (actor.role !== 'TEAM_LEAD') throw new CandidatePermissionError('CEO accounts are read-only')
    const candidate = candidateWithTimestamp(input)
    const { lastUpdatedBy: _lastUpdatedBy, ...storedCandidate } = candidate
    await this.repository.upsert(storedCandidate, actor)
    return (await this.repository.get(candidate.id, actor)) || storedCandidate
  }

  async bulkSave(input: unknown, actor: Actor): Promise<Candidate[]> {
    if (actor.role !== 'TEAM_LEAD') throw new CandidatePermissionError('CEO accounts are read-only')
    if (!Array.isArray(input)) throw new CandidateValidationError('Bulk upsert requires an array')
    const candidates = input.map(candidateWithTimestamp).map(({ lastUpdatedBy: _lastUpdatedBy, ...candidate }) => candidate)
    await this.repository.upsertMany(candidates, actor)
    return this.repository.list(actor)
  }

  health() { return this.repository.checkHealth() }
}
