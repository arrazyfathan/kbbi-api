# Indonesian Language & Quote Scraper API

A REST API for Indonesian language data built with Node.js, Express 5, and TypeScript. The service scrapes KBBI for dictionary definitions and Wikiquote for Indonesian proverbs plus Indonesian figure profiles, photos, descriptions, and quotes.

## Features

- KBBI word search with structured headwords, word classes, and definitions.
- Anonymous word visit tracking using `X-Visitor-Id`.
- Top visited words API backed by Supabase aggregation.
- Paginated Indonesian proverb list, search, and detail endpoints.
- Paginated Indonesian figure summary, search, and detail endpoints.
- Request tracing with `X-Request-Id`, centralized error handling, and request logging with Pino.
- IP-based rate limiting for public routes and stricter scraper-backed search endpoints.
- Controller-service architecture with focused Vitest coverage.
- Vercel-compatible serverless deployment configuration.

## API Documentation

See [docs/API.md](docs/API.md) for the human-readable endpoint reference and [docs/openapi.yaml](docs/openapi.yaml) for the OpenAPI contract.
When the server is running, interactive Swagger UI is available at `http://localhost:3000/docs`.

Quick examples:

```bash
curl http://localhost:3000/api/v1/search/demokrasi
curl -H "X-Request-Id: local-debug-1" http://localhost:3000/api/v1/search/demokrasi
curl -H "X-Visitor-Id: anonymous-client-id" http://localhost:3000/api/v1/search/demokrasi
curl http://localhost:3000/api/v1/words/top?limit=10
curl "http://localhost:3000/api/v1/proverb/search?q=air&page=1&limit=5"
curl "http://localhost:3000/api/v1/figure/search?q=soekarno"
curl "http://localhost:3000/api/v1/figure/Soekarno"
curl "http://localhost:3000/api/v1/translate/demokrasi"
```

Domain endpoints are versioned under `/api/v1`. Legacy root-level domain routes remain available temporarily for backward compatibility during migration.

Every response includes an `x-request-id` header. Provide `X-Request-Id` to preserve a client-generated correlation ID, or omit it and the API will generate one.

## Requirements

- Node.js compatible with the versions required by the dependencies in `package.json`.
- npm.
- Supabase project for word visit tracking and top visited words.

The scraping endpoints can run without Supabase, but word visit tracking and `/api/v1/words/top` require Supabase configuration.

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
BASE_URL=http://localhost:3000
RATE_LIMIT_GLOBAL_WINDOW_MS=900000
RATE_LIMIT_GLOBAL_MAX=300
RATE_LIMIT_SCRAPER_WINDOW_MS=900000
RATE_LIMIT_SCRAPER_MAX=30
WIKIQUOTE_CACHE_TTL_MS=3600000
KBBI_FETCH_TIMEOUT_MS=45000
GOOGLE_TRANSLATE_URL=https://translate.googleapis.com/translate_a/single
GOOGLE_TRANSLATE_TIMEOUT_MS=10000
TRANSLATE_CACHE_TTL_MS=3600000
# Required in production. Use a long random server-only secret for visitor ID hashing.
VISITOR_HASH_SALT=replace-with-random-secret

# Optional for scraping endpoints. Required together for visit tracking and /api/v1/words/top.
SUPABASE_URL=https://your-project.supabase.co
# Required for visit tracking with the bundled migrations.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Optional only if you add explicit public grants and RLS policies.
SUPABASE_ANON_KEY=your-anon-key
```

| Variable                       | Required           | Description                                                                                                       |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `PORT`                         | No                 | Positive integer server port. Defaults to `3000`. Invalid values fail startup.                                    |
| `BASE_URL`                     | No                 | Valid URL used in the root endpoint examples. Defaults to `http://localhost:3000`. Invalid values fail startup.   |
| `RATE_LIMIT_GLOBAL_WINDOW_MS`  | No                 | Positive integer global rate limit window in milliseconds. Defaults to `900000` (`15` minutes).                   |
| `RATE_LIMIT_GLOBAL_MAX`        | No                 | Positive integer global request limit per IP per window. Defaults to `300`.                                       |
| `RATE_LIMIT_SCRAPER_WINDOW_MS` | No                 | Positive integer scraper/search endpoint rate limit window in milliseconds. Defaults to `900000` (`15` minutes).  |
| `RATE_LIMIT_SCRAPER_MAX`       | No                 | Positive integer scraper/search request limit per IP per window. Defaults to `30`.                                |
| `WIKIQUOTE_CACHE_TTL_MS`       | No                 | Positive integer TTL for Wikiquote proverb and figure list/detail caches in milliseconds. Defaults to `3600000`.  |
| `KBBI_FETCH_TIMEOUT_MS`        | No                 | Positive integer timeout for each upstream KBBI HTML fetch in milliseconds. Defaults to `45000` (`45` seconds).   |
| `GOOGLE_TRANSLATE_URL`         | No                 | Valid URL of the Google Translate scraper endpoint. Defaults to the unofficial `translate_a/single` endpoint.     |
| `GOOGLE_TRANSLATE_TIMEOUT_MS`  | No                 | Positive integer timeout for each Google Translate request in milliseconds. Defaults to `10000` (`10` seconds).   |
| `TRANSLATE_CACHE_TTL_MS`       | No                 | Positive integer TTL for the translate cache in milliseconds. Defaults to `3600000` (`1` hour).                   |
| `SUPABASE_URL`                 | For visit tracking | Valid Supabase project URL. If provided, either `SUPABASE_ANON_KEY` or `SUPABASE_SERVICE_ROLE_KEY` is required.   |
| `SUPABASE_ANON_KEY`            | No                 | Supabase anon key. The bundled migrations revoke direct anon access, so this is not enough for visit tracking.    |
| `SUPABASE_SERVICE_ROLE_KEY`    | Visit tracking     | Server-only key for visit tracking. Takes precedence over `SUPABASE_ANON_KEY` and must never be exposed publicly. |
| `VISITOR_HASH_SALT`            | Production         | Server-only salt included when hashing `X-Visitor-Id`. Missing values fail production startup.                    |

Configuration is validated at startup. Missing Supabase variables are allowed so scraping endpoints can run without visit tracking, but partial Supabase configuration fails startup with an explicit error. `VISITOR_HASH_SALT` is required in production; development and test runs warn and continue if it is missing.

Wikiquote proverb and Indonesian figure list/detail responses are cached in process memory until `WIKIQUOTE_CACHE_TTL_MS` expires. Requests before expiry reuse cached data; the first request after expiry refreshes the data from Wikiquote. Translated meanings (`/api/v1/translate/:word`) are cached per word and target language until `TRANSLATE_CACHE_TTL_MS` expires. Caches are process-local, reset on restart, and are not shared across multiple deployed instances.

## Installation

```bash
git clone https://github.com/your-username/kbbi-api.git
cd kbbi-api
npm install
```

## Database Setup

### Hosted Supabase

1. Create a Supabase project from the Supabase dashboard.
2. Open **Project Settings** > **API**.
3. Copy the project URL into `SUPABASE_URL`.
4. Copy the service role key into `SUPABASE_SERVICE_ROLE_KEY`. Keep this key server-side only.
5. Open **SQL Editor** and run the migration files in this order:

```text
supabase/migrations/001_create_word_visits.sql
supabase/migrations/002_create_top_word_visits_view.sql
supabase/migrations/20260722022955_secure_word_visits_rls.sql
supabase/migrations/20260728021955_improve_word_visit_indexes_rls_docs.sql
```

The `word_visits` table stores one unique visit per `word`, `visitor_hash`, and `visited_date`. The `top_word_visits` view powers `GET /api/v1/words/top`. Row-Level Security is enabled and direct `anon`/`authenticated` access is revoked because this API accesses Supabase through the backend service role. Do not expose the service role key to browser or mobile clients.

### Local Supabase CLI

This repository includes `supabase/config.toml` for local Supabase development.

Start Supabase locally:

```bash
supabase start
```

Reset the local database and apply migrations:

```bash
supabase db reset
```

Use the local API URL and service role key printed by `supabase start` in `.env`:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_SERVICE_ROLE_KEY=your-local-service-role-key
```

### Migration Files

```text
supabase/migrations/001_create_word_visits.sql
supabase/migrations/002_create_top_word_visits_view.sql
supabase/migrations/20260722022955_secure_word_visits_rls.sql
supabase/migrations/20260728021955_improve_word_visit_indexes_rls_docs.sql
```

The first migration creates `public.word_visits` and an index on `word`. The second migration creates `public.top_word_visits`, an aggregate view used by the top visited words endpoint. The third migration enables RLS and restricts table/view access to the backend service role. The fourth migration documents the access-control decision and adds composite indexes for current and likely query patterns:

- `(word, visited_date)` supports per-word counts plus date-bounded word analytics.
- `(visitor_hash, visited_date)` supports visitor/day analysis without storing raw visitor IDs.
- The existing unique constraint on `(word, visitor_hash, visited_date)` remains the daily de-duplication and upsert conflict target.

`top_word_visits` intentionally remains a regular view so `/api/v1/words/top` reads live counts. Revisit a materialized view only if production volume makes the aggregate slow and a refresh cadence is acceptable.

### Verify Supabase

After configuring `.env` and starting the API, verify process liveness, app readiness, and Supabase connectivity:

```bash
curl http://localhost:3000/health/live
curl http://localhost:3000/health/ready
curl http://localhost:3000/health/supabase
```

Then verify visit tracking by sending a stable visitor ID:

```bash
curl -H "X-Visitor-Id: local-test-user" http://localhost:3000/api/v1/search/demokrasi
curl http://localhost:3000/api/v1/words/top?limit=10
```

## Development

Start the development server with auto-reload:

```bash
npm run dev
```

The API will be available at `http://localhost:3000` unless `PORT` is changed.

Before opening a pull request, run the full local quality gate:

```bash
npm run check
```

Pull requests should pass the GitHub Actions CI workflow before merge. CI installs dependencies with `npm ci` and runs
the same full quality gate.

For branch workflow, coding conventions, documentation expectations, and the pull request checklist, see
[CONTRIBUTING.md](CONTRIBUTING.md).

## Rate Limiting

The API applies a loose global limit to all routes and a stricter limit to scraper-backed search routes. By default, each IP can make `300` total requests per `15` minutes and `30` requests per `15` minutes to these endpoints:

```text
GET /api/v1/search/:word
GET /api/v1/translate/:word
GET /api/v1/proverb/search
GET /api/v1/figure/search
```

Requests over the limit return HTTP `429`:

```json
{
  "success": false,
  "message": "Too many requests"
}
```

Standard `RateLimit` headers are included where supported. The default limiter uses in-memory storage, so limits are tracked per Node.js process or serverless runtime instance.

## Indonesian Figures

`GET /api/v1/figure` and `GET /api/v1/figure/search` return paginated summaries by default. Summary items contain `name`, `slug`, and `sourceUrl`; use `GET /api/v1/figure/:slug` for full `photo`, `description`, and `quotes`.

For compatibility with older detailed list responses, pass `includeDetails=true` to `/api/v1/figure` or `/api/v1/figure/search`. This opt-in mode fetches detail pages for the current page items, so it is slower than the default summary response.

## Available Scripts

| Command                | Description                                                  |
| ---------------------- | ------------------------------------------------------------ |
| `npm run dev`          | Start the TypeScript development server with auto-reload.    |
| `npm run build`        | Compile TypeScript into `dist/`.                             |
| `npm start`            | Run the compiled server from `dist/server.js`.               |
| `npm test`             | Run the Vitest test suite.                                   |
| `npm run lint`         | Run ESLint on source and test TypeScript files.              |
| `npm run format`       | Format source, test, JSON, and Markdown files with Prettier. |
| `npm run format:check` | Check formatting without writing changes.                    |
| `npm run typecheck`    | Run TypeScript type checking without emitting files.         |
| `npm run check`        | Run type checking, linting, format check, tests, and build.  |

## Testing

Run all tests:

```bash
npm test
```

This runs the unit tests and integration tests. Integration tests exercise the real Express app through HTTP requests
with external KBBI, Wikiquote, and Supabase dependencies mocked for deterministic local runs.

Run a production build check:

```bash
npm run build
```

The test suite covers parser fixtures, controller behavior, error responses, middleware, word visit tracking, top visited
words behavior, and HTTP integration behavior.

## Code Quality

This project uses Vitest for tests, ESLint flat config with TypeScript support for linting, and Prettier for formatting. ESLint formatting conflicts are disabled so Prettier owns code style while ESLint focuses on code quality.

Run the full local verification before merging dependency updates or behavior changes:

```bash
npm run check
```

## Project Structure

```text
src/
├── config/             # Environment and Supabase configuration
├── controllers/        # Express request handlers
├── interfaces/         # TypeScript response and domain types
├── lib/                # Shared HTTP, logging, and async utilities
├── middlewares/        # Request logging and error handling
├── routes/             # API route definitions
├── services/           # Scraping, parsing, and persistence logic
├── app.ts              # Express application setup
└── server.ts           # Server entry point

docs/
├── API.md              # Endpoint reference
└── openapi.yaml        # OpenAPI contract

supabase/
└── migrations/         # Database schema and view migrations

test/
├── fixtures/           # HTML parser fixtures
└── *.test.ts           # Vitest tests
```

## Deployment

The repository includes `vercel.json` configured to route all requests to `src/server.ts` with `@vercel/node`.

For production deployment:

1. Configure the environment variables in the hosting provider.
2. Apply Supabase migrations.
3. Deploy the app.
4. Confirm `GET /health/live`, `GET /health/ready`, and `GET /health/supabase` report the expected runtime status.

## Visit Tracking Behavior

Clients may send `X-Visitor-Id` when calling `GET /api/v1/search/:word`. The API combines this value with `VISITOR_HASH_SALT`, stores only the resulting SHA-256 hash, and counts one unique visit per word, visitor, and day. Raw visitor IDs are not stored or logged. Search responses include `visitorCount`; it is `null` when the header is missing or Supabase tracking is unavailable.

Changing `VISITOR_HASH_SALT` changes the generated visitor hashes, so existing visitor identity buckets will no longer match new requests.

## License

This project is licensed under the ISC License.
