import type { Request, Response } from 'express'
import { CandidateService, CandidateValidationError } from '../services/candidate-service.js'

function handleError(error: unknown, res: Response) {
  if (error instanceof CandidateValidationError) return res.status(400).json({ error: error.message })
  return res.status(500).json({ error: 'The candidate service is unavailable' })
}

export function candidateController(service: CandidateService) {
  return {
    list: async (_req: Request, res: Response) => { try { return res.json(await service.list()) } catch (error) { return handleError(error, res) } },
    get: async (req: Request, res: Response) => {
      try {
        const id = String(req.params.id)
        const candidate = await service.get(id)
        return candidate ? res.json(candidate) : res.status(404).json({ error: 'Candidate not found' })
      } catch (error) { return handleError(error, res) }
    },
    create: async (req: Request, res: Response) => { try { return res.status(201).json(await service.save(req.body)) } catch (error) { return handleError(error, res) } },
    bulkUpsert: async (req: Request, res: Response) => { try { return res.json(await service.bulkSave(req.body)) } catch (error) { return handleError(error, res) } },
    remove: async (req: Request, res: Response) => {
      try {
        const removed = await service.remove(String(req.params.id))
        return removed ? res.status(204).end() : res.status(404).json({ error: 'Candidate not found' })
      } catch (error) { return handleError(error, res) }
    },
  }
}
