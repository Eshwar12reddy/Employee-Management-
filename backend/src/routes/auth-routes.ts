import { Router } from 'express'
import type { AppConfig } from '../config/environment.js'
import { authController } from '../controllers/auth-controller.js'
import { requireAuth, requireCsrf, requirePreAuthCsrf } from '../middleware/auth.js'
import { AuthService } from '../services/auth-service.js'

export function authRoutes(service: AuthService, config: AppConfig) {
  const router = Router(); const controller = authController(service, config)
  router.get('/csrf', controller.csrf)
  router.post('/login', requirePreAuthCsrf(service), controller.login)
  router.get('/me', requireAuth(service), controller.me)
  router.post('/logout', requireAuth(service), requireCsrf(service), controller.logout)
  return router
}
