export type UserRole = 'CEO' | 'TEAM_LEAD'
export type Actor = { id: string; role: UserRole }
export class CandidatePermissionError extends Error {}

export type Candidate = {
  id: string
  updatedAt: string
  lastUpdatedBy?: { id: string; name: string; email: string; role: UserRole }
  [key: string]: unknown
}

export interface CandidateRepository {
  list(actor: Actor): Promise<Candidate[]>
  get(id: string, actor: Actor): Promise<Candidate | null>
  upsert(candidate: Candidate, actor: Actor): Promise<void>
  upsertMany(candidates: Candidate[], actor: Actor): Promise<void>
  remove(id: string, actor: Actor): Promise<boolean>
  checkHealth(): Promise<void>
  close(): Promise<void>
}
