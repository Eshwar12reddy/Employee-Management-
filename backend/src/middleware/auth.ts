import type { NextFunction, Request, RequestHandler, Response } from 'express'
import { parse } from 'cookie'
import type { AppConfig } from '../config/environment.js'
import type { UserRole } from '../db/candidate-repository.js'
import { AuthService, type AuthContext } from '../services/auth-service.js'

declare global {
  namespace Express { interface Request { auth?: AuthContext } }
}

export const SESSION_COOKIE = 'ems_session'
export const CSRF_COOKIE = 'ems_csrf'
export const cookies = (req: Request) => parse(req.headers.cookie || '')

export function setCsrfCookie(res: Response, config: AppConfig, token: string) {
  res.cookie(CSRF_COOKIE, token, { httpOnly: false, secure: config.cookieSecure, sameSite: config.cookieSameSite, maxAge: 10 * 60 * 1000, path: '/' })
}

export function setSessionCookies(res: Response, config: AppConfig, session: { sessionToken: string; csrfToken: string; expiresAt: string }) {
  const maxAge = Math.max(0, new Date(session.expiresAt).getTime() - Date.now())
  res.cookie(SESSION_COOKIE, session.sessionToken, { httpOnly: true, secure: config.cookieSecure, sameSite: config.cookieSameSite, maxAge, path: '/' })
  res.cookie(CSRF_COOKIE, session.csrfToken, { httpOnly: false, secure: config.cookieSecure, sameSite: config.cookieSameSite, maxAge, path: '/' })
}

export function clearSessionCookies(res: Response, config: AppConfig) {
  const options = { secure: config.cookieSecure, sameSite: config.cookieSameSite as 'lax' | 'strict' | 'none', path: '/' }
  res.clearCookie(SESSION_COOKIE, options); res.clearCookie(CSRF_COOKIE, options)
}

export function requireAuth(authService: AuthService): RequestHandler {
  return async (req, res, next) => {
    try {
      const context = await authService.authenticate(cookies(req)[SESSION_COOKIE])
      if (!context) return res.status(401).json({ error: 'Authentication required' })
      req.auth = context
      return next()
    } catch { return res.status(401).json({ error: 'Authentication required' }) }
  }
}

export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, res, next) => req.auth && roles.includes(req.auth.user.role) ? next() : res.status(403).json({ error: 'You are not authorized to perform this action' })
}

export function requireCsrf(authService: AuthService): RequestHandler {
  return (req, res, next) => req.auth && authService.verifyCsrf(req.auth.session, cookies(req)[CSRF_COOKIE], req.get('x-csrf-token')) ? next() : res.status(403).json({ error: 'CSRF validation failed' })
}

export function requirePreAuthCsrf(authService: AuthService): RequestHandler {
  return (req, res, next) => authService.verifyPreAuthCsrf(cookies(req)[CSRF_COOKIE], req.get('x-csrf-token')) ? next() : res.status(403).json({ error: 'CSRF validation failed' })
}
