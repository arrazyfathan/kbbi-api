# Indonesian Language & Quote Scraper API

A REST API for Indonesian language data built with Node.js, Express 5, and TypeScript. The service scrapes KBBI for dictionary definitions and Wikiquote for Indonesian proverbs plus Indonesian figure profiles, photos, descriptions, and quotes.

## Features

- KBBI word search with structured headwords, word classes, and definitions.
- Anonymous word visit tracking using `X-Visitor-Id`.
- Top visited words API backed by Supabase aggregation.
- Paginated Indonesian proverb list, search, and detail endpoints.
- Paginated Indonesian figure list, search, and detail endpoints.
- Centralized error handling and request logging with Pino.
- IP-based rate limiting for public routes and stricter scraper-backed search endpoints.
- Controller-service architecture with focused Vitest coverage.
- Vercel-compatible serverless deployment configuration.

## API Documentation

See [docs/API.md](docs/API.md) for the full endpoint reference, request parameters, headers, and response examples.

Quick examples:

```bash
curl http://localhost:3000/search/demokrasi
curl -H "X-Visitor-Id: anonymous-client-id" http://localhost:3000/search/demokrasi
curl http://localhost:3000/words/top?limit=10
curl "http://localhost:3000/proverb/search?q=air&page=1&limit=5"
curl "http://localhost:3000/figure/search?q=soekarno"
```

## Requirements

- Node.js compatible with the versions required by the dependencies in `package.json`.
- npm.
- Supabase project for word visit tracking and top visited words.

The scraping endpoints can run without Supabase, but word visit tracking and `/words/top` require Supabase configuration.

## Environment Variables

Create a `.env` file in the project root:

```env
PORT=3000
BASE_URL=http://localhost:3000
RATE_LIMIT_GLOBAL_WINDOW_MS=900000
RATE_LIMIT_GLOBAL_MAX=300
RATE_LIMIT_SCRAPER_WINDOW_MS=900000
RATE_LIMIT_SCRAPER_MAX=30
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
# Optional. Used before SUPABASE_ANON_KEY when present.
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

| Variable                       | Required           | Description                                                                                     |
| ------------------------------ | ------------------ | ----------------------------------------------------------------------------------------------- |
| `PORT`                         | No                 | Server port. Defaults to `3000`.                                                                |
| `BASE_URL`                     | No                 | Base URL used in the root endpoint examples. Defaults to `http://localhost:3000`.               |
| `RATE_LIMIT_GLOBAL_WINDOW_MS`  | No                 | Global rate limit window in milliseconds. Defaults to `900000` (`15` minutes).                  |
| `RATE_LIMIT_GLOBAL_MAX`        | No                 | Global request limit per IP per window. Defaults to `300`.                                      |
| `RATE_LIMIT_SCRAPER_WINDOW_MS` | No                 | Scraper/search endpoint rate limit window in milliseconds. Defaults to `900000` (`15` minutes). |
| `RATE_LIMIT_SCRAPER_MAX`       | No                 | Scraper/search request limit per IP per window. Defaults to `30`.                               |
| `SUPABASE_URL`                 | For visit tracking | Supabase project URL.                                                                           |
| `SUPABASE_ANON_KEY`            | For visit tracking | Supabase anon key.                                                                              |
| `SUPABASE_SERVICE_ROLE_KEY`    | No                 | Preferred Supabase key when provided.                                                           |

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
4. Copy either the anon key into `SUPABASE_ANON_KEY` or the service role key into `SUPABASE_SERVICE_ROLE_KEY`.
5. Open **SQL Editor** and run the migration files in this order:

```text
supabase/migrations/001_create_word_visits.sql
supabase/migrations/002_create_top_word_visits_view.sql
```

The `word_visits` table stores one unique visit per `word`, `visitor_hash`, and `visited_date`. The `top_word_visits` view powers `GET /words/top`.

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

Use the local API URL and anon key printed by `supabase start` in `.env`:

```env
SUPABASE_URL=http://127.0.0.1:54321
SUPABASE_ANON_KEY=your-local-anon-key
```

### Migration Files

```text
supabase/migrations/001_create_word_visits.sql
supabase/migrations/002_create_top_word_visits_view.sql
```

The first migration creates `public.word_visits` and an index on `word`. The second migration creates `public.top_word_visits`, an aggregate view used by the top visited words endpoint.

### Verify Supabase

After configuring `.env` and starting the API, verify the connection:

```bash
curl http://localhost:3000/health/supabase
```

Then verify visit tracking by sending a stable visitor ID:

```bash
curl -H "X-Visitor-Id: local-test-user" http://localhost:3000/search/demokrasi
curl http://localhost:3000/words/top?limit=10
```

## Development

Start the development server with auto-reload:

```bash
npm run dev
```

The API will be available at `http://localhost:3000` unless `PORT` is changed.

## Rate Limiting

The API applies a loose global limit to all routes and a stricter limit to scraper-backed search routes. By default, each IP can make `300` total requests per `15` minutes and `30` requests per `15` minutes to these endpoints:

```text
GET /search/:word
GET /proverb/search
GET /figure/search
```

Requests over the limit return HTTP `429`:

```json
{
  "success": false,
  "message": "Too many requests"
}
```

Standard `RateLimit` headers are included where supported. The default limiter uses in-memory storage, so limits are tracked per Node.js process or serverless runtime instance.

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

Run a production build check:

```bash
npm run build
```

The test suite covers parser fixtures, controller behavior, error responses, word visit tracking, and top visited words behavior.

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
└── API.md              # Endpoint reference

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
4. Confirm `GET /health/supabase` reports the expected Supabase connection status.

## Visit Tracking Behavior

Clients may send `X-Visitor-Id` when calling `GET /search/:word`. The API hashes this value before storage and counts one unique visit per word, visitor, and day. Search responses include `visitorCount`; it is `null` when the header is missing or Supabase tracking is unavailable.

## License

This project is licensed under the ISC License.
