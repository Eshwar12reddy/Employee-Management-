import type { Request, Response } from 'express'
import { randomBytes } from 'node:crypto'
import type { AppConfig } from '../config/environment.js'
import { clearSessionCookies, cookies, CSRF_COOKIE, SESSION_COOKIE, setCsrfCookie, setSessionCookies } from '../middleware/auth.js'
import { AuthError, AuthService } from '../services/auth-service.js'

function errorResponse(error: unknown, res: Response) { return error instanceof AuthError ? res.status(400).json({ error: error.message }) : res.status(500).json({ error: 'Authentication service is unavailable' }) }

export function authController(service: AuthService, config: AppConfig) {
  return {
    csrf: (req: Request, res: Response) => { const token = cookies(req)[CSRF_COOKIE] || randomBytes(32).toString('base64url'); setCsrfCookie(res, config, token); return res.json({ ok: true }) },
    setupStatus: async (_req: Request, res: Response) => res.json({ needsCeoSetup: await service.needsCeoBootstrap() }),
    bootstrapCeo: async (req: Request, res: Response) => { try { const result = await service.bootstrapCeo(String(req.body?.email || ''), String(req.body?.name || ''), String(req.body?.password || '')); setSessionCookies(res, config, result); return res.status(201).json({ user: result.user }) } catch (error) { return errorResponse(error, res) } },
    login: async (req: Request, res: Response) => { try { const result = await service.login(String(req.body?.email || ''), String(req.body?.password || '')); setSessionCookies(res, config, result); return res.json({ user: result.user }) } catch (error) { return errorResponse(error, res) } },
    me: (req: Request, res: Response) => req.auth ? res.json({ user: req.auth.user }) : res.status(401).json({ error: 'Authentication required' }),
    logout: async (req: Request, res: Response) => { await service.logout(cookies(req)[SESSION_COOKIE]); clearSessionCookies(res, config); return res.status(204).end() },
  }
}
