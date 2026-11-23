export type Candidate = {
  id: string
  updatedAt: string
  [key: string]: unknown
}

export interface CandidateRepository {
  list(): Promise<Candidate[]>
  get(id: string): Promise<Candidate | null>
  upsert(candidate: Candidate): Promise<void>
  upsertMany(candidates: Candidate[]): Promise<void>
  remove(id: string): Promise<boolean>
  checkHealth(): Promise<void>
  close(): Promise<void>
}
