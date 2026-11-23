import { Router } from 'express'
import { candidateController } from '../controllers/candidate-controller.js'
import type { CandidateService } from '../services/candidate-service.js'
import { requireAuth, requireCsrf, requireRole } from '../middleware/auth.js'
import { AuthService } from '../services/auth-service.js'

export function candidateRoutes(service: CandidateService, authService: AuthService) {
  const router = Router()
  const controller = candidateController(service)
  router.use(requireAuth(authService))
  router.get('/', controller.list)
  router.get('/:id', controller.get)
  router.post('/', requireRole('TEAM_LEAD'), requireCsrf(authService), controller.create)
  router.put('/', requireRole('TEAM_LEAD'), requireCsrf(authService), controller.bulkUpsert)
  router.delete('/:id', requireRole('TEAM_LEAD'), requireCsrf(authService), controller.remove)
  return router
}
