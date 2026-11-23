import cors from 'cors'
import type { AppConfig } from '../config/environment.js'

export function corsPolicy(config: AppConfig) {
  return cors({
    origin: config.frontendOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-access-key'],
    maxAge: 600,
  })
}
