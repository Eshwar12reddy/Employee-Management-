# Clyptus.ai employee evaluation workspace

React/Vite frontend and Express API for candidate evaluation reports. Candidate payloads remain compatible with the existing application: projects, ratings, capabilities, skills, contribution points, summary, recommendation, photos, and imported fields are stored together as JSON. The production database is PostgreSQL; SQLite is intentionally limited to local development.

## Repository structure

```text
frontend/
  src/App.tsx                         Existing list, form, dashboard, import, and print workflow
  src/features/candidates/             Candidate types, API client, and browser helpers
  src/styles.css                       Existing visual design
  vite.config.ts                       Dev proxy and Vite build configuration
backend/
  src/app.ts                           Express middleware and routes
  src/config/environment.ts            Environment validation and database selection
  src/controllers/                     HTTP response handling
  src/db/                              Migration runner and repository contract
  src/repositories/                    PostgreSQL and local SQLite implementations
  src/services/candidate-service.ts    Validation, timestamps, and bulk-upsert behavior
  migrations/                          Versioned PostgreSQL/SQLite migrations
  src/scripts/                         Migration, backup, and import commands
render.yaml                            Render Web Service, Static Site, and PostgreSQL blueprint
.env.example                           Safe variable names and placeholders only
```

## Requirements

- Node.js 20 or newer
- npm 10 or newer
- PostgreSQL for shared/production use, or SQLite automatically for local development

Install from the repository root:

```powershell
npm install
Copy-Item .env.example .env
```

`APP_ACCESS_KEY` is a user-entered shared workspace key. It is never compiled into the frontend or read from a `VITE_*` variable. In local development it can be left empty while `ALLOW_INSECURE_LOCAL=true`; production requires it.

## Local development

With no `DATABASE_URL`, the backend creates `data/candidates.sqlite`, applies the SQLite migration, and listens on `http://localhost:3001`.

```powershell
npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` to the backend. To use an access key locally, set `APP_ACCESS_KEY` and enter that key in the unlock prompt. To use PostgreSQL locally, set `DATABASE_URL` and run:

```powershell
npm run migrate
npm run dev
```

## API contract

All candidate routes require `x-access-key` when `APP_ACCESS_KEY` is configured. `GET /api/health` is unauthenticated and only reports reachability plus the database driver.

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/health` | Database reachability check |
| GET | `/api/candidates` | List candidates, newest updated first |
| GET | `/api/candidates/:id` | Read one candidate |
| POST | `/api/candidates` | Create or update one candidate by its existing id |
| PUT | `/api/candidates` | Transactional bulk upsert; records absent from the request are retained |
| DELETE | `/api/candidates/:id` | Delete one candidate |

Invalid JSON, oversized bodies, missing IDs, missing records, and unauthorized requests return safe error messages without payloads, access keys, connection strings, or photos in logs.

## Data and migration behavior

- PostgreSQL stores `id`, `updated_at`, and the complete candidate payload in a JSONB `payload` column. An index supports newest-first listing, and a check constraint keeps the JSON id aligned with the primary key.
- SQLite uses the same logical schema with a TEXT JSON payload for local-only development.
- Migrations are versioned in `backend/migrations/` and run automatically at API startup. They can also be run explicitly with `npm run migrate`.
- Browser `localStorage` remains the offline cache (`clyptus-candidates`) and draft store (`clyptus-draft`) so the current offline workflow is preserved. The access key is held in `sessionStorage`, not bundled into the application.
- Photos are retained in the candidate payload as data URLs or supported links. The frontend shrinks large image uploads before sending them; the API has a 4 MB JSON body limit.
- Excel/CSV import still deduplicates by normalized name + email in the browser. The candidate list also exports the complete evaluation dataset to a timestamped `.xlsx` workbook. Bulk API calls only upsert submitted IDs and never delete unrelated rows.

Back up local SQLite before moving to PostgreSQL:

```powershell
npm run backup:local -- --output=backups/candidates.json
```

Set production `DATABASE_URL`, then import and verify row counts:

```powershell
$env:DATABASE_URL = "postgresql://user:password@host/database?sslmode=require"
$env:APP_ACCESS_KEY = "use-the-production-key"
npm run migrate
npm run import:backup -- --file=backups/candidates.json --on-duplicate=update
```

Use `--on-duplicate=skip` to retain an existing PostgreSQL row. The import command reports imported/skipped counts and before/after row counts. Keep backups outside Git; `backups/`, `.env`, database files, and build output are ignored.

## Render deployment

The root `render.yaml` defines:

- `clyptus-api`: Node Web Service, `npm ci && npm run build --workspace backend`, start `npm run start --workspace backend`, health check `/api/health`.
- `clyptus-frontend`: Static Site, `npm ci && npm run build --workspace frontend`, publish directory `frontend/dist`, SPA rewrite to `/index.html`.
- `clyptus-db`: Render PostgreSQL, linked to the API as `DATABASE_URL`.

After creating the Blueprint, configure these values in the Render Dashboard:

### API Web Service

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Blueprint-linked PostgreSQL connection string |
| `APP_ACCESS_KEY` | Long random value; never commit it |
| `FRONTEND_ORIGIN` | Exact deployed frontend origin, e.g. `https://clyptus-frontend.onrender.com` |
| `JSON_BODY_LIMIT` | `4mb` |

The service must bind to `0.0.0.0` and uses Render's `PORT` automatically. It runs migrations at startup and does not use SQLite in production.

### Static Site

| Variable | Value |
|---|---|
| `VITE_API_BASE_URL` | Full API base ending in `/api`, e.g. `https://clyptus-api.onrender.com/api` |

Because `VITE_API_BASE_URL` is public build configuration, it must not contain credentials. If either Render service gets a different URL, update the other service's value so `FRONTEND_ORIGIN` and the API base match the deployed URLs exactly.

## Verification and troubleshooting

```powershell
npm run typecheck
npm run build
Invoke-WebRequest http://localhost:3001/api/health
```

To verify persistence after a deploy, create a disposable candidate, reload the frontend, query `GET /api/candidates` with the access key, redeploy/restart the API, and query again. Do not use real employee data for smoke checks.

Common issues:

- `401 Access key required`: enter the exact API `APP_ACCESS_KEY`; do not put it in `VITE_API_BASE_URL`.
- CORS errors: set `FRONTEND_ORIGIN` to the exact scheme + hostname of the Static Site, without a trailing path.
- `503 Database is unavailable`: verify `DATABASE_URL`, database availability, and Render region/network settings; API startup logs intentionally do not print credentials.
- Empty local list after clearing site data: browser cache and drafts are local fallback data; restore shared records from PostgreSQL or a backup.

No deployment, production migration, or destructive data operation is run by the repository build scripts.
