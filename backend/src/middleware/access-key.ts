import { createHash, timingSafeEqual } from 'node:crypto'
import type { RequestHandler } from 'express'
import type { AppConfig } from '../config/environment.js'

const digest = (value: string) => createHash('sha256').update(value).digest()

export function requireAccessKey(config: AppConfig): RequestHandler {
  return (req, res, next) => {
    if (!config.appAccessKey && config.allowInsecureLocal) return next()

    const sent = req.get('x-access-key') || ''
    const valid = sent.length > 0 && timingSafeEqual(digest(sent), digest(config.appAccessKey))
    if (!valid) return res.status(401).json({ error: 'Access key required' })
    return next()
  }
}
