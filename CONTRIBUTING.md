# Contributing

Thanks for helping improve `kbbi-api`. This project is a Node.js, Express 5, and TypeScript API with npm as the package manager.

## Local Setup

1. Install Node.js 24 or a version compatible with the dependency requirements in `package.json`.
2. Install dependencies:

```bash
npm ci
```

3. Create a local `.env` file using the environment variable reference in `README.md`.
4. Start the development server:

```bash
npm run dev
```

The API runs at `http://localhost:3000` unless `PORT` is changed.

Supabase is optional for scraper-only development, but word visit tracking and `/api/v1/words/top` require `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. See the database setup section in `README.md` for hosted and local Supabase workflows.

## Branch Workflow

- Branch from the latest `main`.
- Keep pull requests focused on one behavior change, fix, or documentation update.
- Use clear commit messages that describe the user-facing or maintenance impact.
- Open pull requests back into `main`.
- Wait for GitHub Actions CI to pass before merging.

## Test Expectations

Run the full quality gate before opening or updating a pull request:

```bash
npm run check
```

For targeted local feedback, use:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Behavior changes should include focused Vitest coverage. API contract changes should also update and validate `docs/openapi.yaml`.

## Coding Conventions

- Use TypeScript for source and tests.
- Keep route, controller, service, parser, and shared library responsibilities separated.
- Prefer small, behavior-oriented tests over broad implementation assertions.
- Let Prettier own formatting and ESLint own code-quality checks.
- Keep generated output, local logs, secrets, and machine-specific files out of version control.
- Do not expose `SUPABASE_SERVICE_ROLE_KEY` or other server-only secrets to browser or mobile clients.

## Documentation Expectations

Update documentation in the same pull request as the behavior it describes:

- Update `README.md` for setup, deployment, environment, or contributor-facing workflow changes.
- Update `docs/API.md` for endpoint behavior visible to API consumers.
- Update `docs/openapi.yaml` for request, response, status code, or schema changes.
- Mention migrations or deployment steps in the pull request when database behavior changes.

## Pull Request Checklist

Before requesting review, confirm that:

- `npm run check` passes locally.
- Relevant tests were added or updated.
- README, API docs, and OpenAPI docs were updated when applicable.
- No generated files, local logs, secrets, or machine-specific files are committed.
- The pull request description explains the change, testing, and any migration or deployment notes.
