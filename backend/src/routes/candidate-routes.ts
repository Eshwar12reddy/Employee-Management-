import { Router } from 'express'
import { candidateController } from '../controllers/candidate-controller.js'
import type { CandidateService } from '../services/candidate-service.js'

export function candidateRoutes(service: CandidateService) {
  const router = Router()
  const controller = candidateController(service)
  router.get('/', controller.list)
  router.get('/:id', controller.get)
  router.post('/', controller.create)
  router.put('/', controller.bulkUpsert)
  router.delete('/:id', controller.remove)
  return router
}
