import express from 'express'
import type { AppConfig } from './config/environment.js'
import type { CandidateService } from './services/candidate-service.js'
import { corsPolicy } from './middleware/cors-policy.js'
import { candidateRoutes } from './routes/candidate-routes.js'
import { authRoutes } from './routes/auth-routes.js'
import { userRoutes } from './routes/user-routes.js'

import type { AuthService } from './services/auth-service.js'

function databaseErrorCategory(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : ''
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) return 'dns'
  if (['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT'].includes(code)) return 'network'
  if (['28P01', '28000'].includes(code)) return 'authentication'
  if (code === '3D000') return 'database-not-found'
  if (code === '57P03') return 'database-starting'
  return 'query-or-migration'
}

export function createApp(config: AppConfig, service: CandidateService, authService: AuthService) {
  const app = express()
  app.disable('x-powered-by')
  app.use(corsPolicy(config))
  app.use(express.json({ limit: config.jsonBodyLimit, strict: true }))

  app.get('/api/health', async (_req, res) => {
    try {
      await service.health()
      await authService.health()
      return res.json({ ok: true, database: config.databaseDriver })
    } catch (error) {
      console.error(`[health] database unavailable (${databaseErrorCategory(error)})`)
      return res.status(503).json({ ok: false, error: 'Database is unavailable' })
    }
  })

  app.use('/api/auth', authRoutes(authService, config))
  app.use('/api/users', userRoutes(authService))
  app.use('/api/candidates', candidateRoutes(service, authService))

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof SyntaxError) return res.status(400).json({ error: 'Invalid JSON body' })
    if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' })
    return res.status(500).json({ error: 'Unexpected server error' })
  })

  return app
}
