import type { Request, Response } from 'express'
import { AuthError, AuthService } from '../services/auth-service.js'

export function userController(service: AuthService) {
  return {
    createTeamLead: async (req: Request, res: Response) => {
      try {
        const user = await service.createUser({ email: String(req.body?.email || ''), name: String(req.body?.name || ''), password: String(req.body?.password || ''), role: 'TEAM_LEAD' })
        return res.status(201).json({ user })
      } catch (error) { return error instanceof AuthError ? res.status(400).json({ error: error.message }) : res.status(500).json({ error: 'User service is unavailable' }) }
    },
  }
}
