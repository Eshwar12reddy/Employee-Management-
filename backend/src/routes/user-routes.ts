import { Router } from 'express'
import { userController } from '../controllers/user-controller.js'
import { requireAuth, requireCsrf, requireRole } from '../middleware/auth.js'
import { AuthService } from '../services/auth-service.js'

export function userRoutes(service: AuthService) {
  const router = Router(); const controller = userController(service)
  router.post('/', requireAuth(service), requireRole('CEO'), requireCsrf(service), controller.createTeamLead)
  return router
}
