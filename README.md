# Clyptus.ai employee evaluation workspace

React/Vite frontend and Express API for candidate evaluation reports. Candidate payloads remain compatible with the existing application: projects, ratings, capabilities, skills, contribution points, summary, recommendation, photos, and imported fields are stored together as JSON. The production database is PostgreSQL; SQLite is intentionally limited to local development.

## Repository structure

```text
frontend/
  src/App.tsx                         Existing list, form, dashboard, import, and print workflow
  src/features/candidates/             Candidate types, auth/API client, sync, and browser helpers
  src/styles.css                       Existing visual design
  vite.config.ts                       Dev proxy and Vite build configuration
backend/
  src/app.ts                           Express middleware and routes
  src/config/environment.ts            Environment validation and database selection
  src/controllers/                     HTTP response handling
  src/db/                              Migration runner and repository contract
  src/repositories/                    PostgreSQL and local SQLite implementations
  src/services/                        Authentication, roles, validation, timestamps, and bulk-upsert behavior
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

Individual accounts replace the shared unlock flow. `APP_ACCESS_KEY` remains in configuration temporarily as a legacy deployment setting during the migration, but is not used to authorize candidate requests. It is never compiled into the frontend or read from a `VITE_*` variable.

## Local development

With no `DATABASE_URL`, the backend creates `data/candidates.sqlite`, applies the SQLite migration, and listens on `http://localhost:3001`.

```powershell
npm run dev
```

Open `http://localhost:5173`. The frontend proxies `/api` to the backend. On a fresh database, the sign-in screen provides a one-time first CEO setup form. The CLI remains available for secure provisioning:

```powershell
npm --workspace backend run provision:user -- --role=CEO
```

The CLI prompts for the name, email, and password without storing the password. Provision Team Leads with `--role=TEAM_LEAD`. For non-interactive provisioning, set `PROVISION_PASSWORD` only in the current shell. To use PostgreSQL locally, set `DATABASE_URL` and run:

```powershell
npm run migrate
npm run dev
```

## Authentication and API contract

Login creates a server-side session in PostgreSQL. The session is sent only in a Secure/HttpOnly cookie; the frontend does not store passwords, session tokens, or access keys. A separate CSRF cookie is paired with the `x-csrf-token` header for state-changing requests. CORS allows only `FRONTEND_ORIGIN` and credentialed requests.

`CEO` accounts can read all candidates but are read-only. `TEAM_LEAD` accounts can create, import, update, and delete candidates they own. Legacy records without an owner can be claimed by the first Team Lead who updates them. The backend enforces these rules; hiding buttons in the frontend is only a usability layer.

| Method | Route | Behavior |
|---|---|---|
| GET | `/api/health` | Database reachability check |
| GET | `/api/auth/csrf` | Establish CSRF cookie |
| GET | `/api/auth/setup-status` | Report whether the one-time CEO setup is still available |
| POST | `/api/auth/bootstrap-ceo` | Create the first CEO account only, then start its session |
| POST | `/api/auth/login` | Start an individual session |
| GET | `/api/auth/me` | Return the current user and role |
| POST | `/api/auth/logout` | End the current session |
| POST | `/api/users` | CEO-only Team Lead provisioning endpoint; also available from the CEO UI |
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
- Browser `localStorage` remains only an offline cache (`clyptus-candidates`) and draft store (`clyptus-draft`). After authentication, the app fetches PostgreSQL data and replaces the cache; it does not use stale local data as the online source of truth.
- Open views poll `/api/candidates` every 15 seconds and also react to same-origin BroadcastChannel/storage notifications. Polling is the reliable cross-browser/device path for CEO visibility.
- Photos are retained in the candidate payload as data URLs or supported links. The frontend shrinks large image uploads before sending them; the API has a 4 MB JSON body limit.
- Excel/CSV import still deduplicates by normalized name + email in the browser. The candidate list also exports the complete evaluation dataset to a timestamped `.xlsx` workbook. Bulk API calls only upsert submitted IDs and never delete unrelated rows.

Back up local SQLite before moving to PostgreSQL:

```powershell
npm run backup:local -- --output=backups/candidates.json
```

Set production `DATABASE_URL`, then import and verify row counts. The import command uses a migration actor and leaves imported records unowned so a Team Lead can manage them:

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
| `SESSION_TTL_HOURS` | `12` |
| `COOKIE_SECURE` | `true` |
| `COOKIE_SAME_SITE` | `none` for separate Render origins |

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
npm run test:auth --workspace backend
Invoke-WebRequest http://localhost:3001/api/health
```

To verify persistence after a deploy, provision a CEO and Team Lead, create a disposable candidate as the Team Lead, then sign in as the CEO from a separate browser/device and confirm the record appears. Do not use real employee data for smoke checks.

Common issues:

- `401 Authentication required`: sign in again; sessions are per browser and stored in HttpOnly cookies.
- `403 CSRF validation failed`: reload the frontend so it can establish a CSRF cookie, then sign in again.
- CORS errors: set `FRONTEND_ORIGIN` to the exact scheme + hostname of the Static Site, without a trailing path.
- `503 Database is unavailable`: verify `DATABASE_URL`, database availability, and Render region/network settings; API startup logs intentionally do not print credentials.
- Empty local list after clearing site data: browser cache and drafts are local fallback data; restore shared records from PostgreSQL or a backup.

No deployment, production migration, or destructive data operation is run by the repository build scripts.
