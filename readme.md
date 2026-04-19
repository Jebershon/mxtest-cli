# mxtest-cli

Mendix + Playwright testing CLI. This tool helps build Mendix docker artifacts, start containers, run Playwright tests and produce HTML reports.

## Features
- Verify environment (mxcli, Docker, Playwright)
- Initialize a test folder with a sample Playwright test
- Build Mendix Docker artifacts and prepare `.docker`
- Start/stop the project's docker compose stack
- Run Playwright tests and generate HTML reports
- Manage `mxtest.config.json` settings

## Installation

Install dependencies and link the CLI (development):

```powershell
cd C:\Projects\custom-cli\mxtest-cli
npm install
npm link
```

After `npm link` the `mxtest` command will be available globally.

## Commands

Primary commands and short notes:

- `mxtest doctor` — verify required tools (mxcli, docker, playwright).
- `mxtest init` — initialize testing scaffolding (detects `.mpr`, creates `tests/sample.spec.js`).
- `mxtest build [clientPort] [postgresPort]` — run `mxcli docker build` and prepare `.docker` (writes `.env` and `docker-compose.yml` if needed).
- `mxtest run` — start the prepared `.docker` compose stack. This command expects local build artifacts (a `.docker/build` folder and `.docker/docker-compose.yml`) produced by `mxtest build`. It will run `docker compose up -d` (no pulls) and retry `down`+`up` once on port conflicts.
- `mxtest run-build [--no-wait]` — force a clean rebuild: stops any existing stack, removes `.docker`, runs `mxtest build`, builds local images (`docker compose build`) and starts the stack (`docker compose up -d`). Use `--no-wait` to skip waiting for the app URL.
- `mxtest test [options]` — run Playwright tests (supports `--path`, `--url`, `--headed`, `--browser`, `--retry`, `--ci`, `--no-report`).
- `mxtest result` — open/show the last Playwright report.
- `mxtest down` — stop the docker compose stack in `.docker`.
- `mxtest status` — show container status for the stack.
- `mxtest logs [--tail N] [--follow]` — show docker compose logs.
- `mxtest config [show|set]` — view or update `mxtest.config.json` (allowed keys: `testDir`, `appUrl`, `clientPort`, `postgresPort`, `waitTimeout`, `image`).
- `mxtest playwright [...args]` — pass-through to `npx playwright`.

### Database & snapshots

The CLI now supports external PostgreSQL configuration and database snapshots using a zero-config UX. The tool stores per-project state under a hidden `.mxtest/` folder in your project root. That folder contains:

- `.mxtest/config.json` — DB mode and connection info
- `.mxtest/.env` — stored DB password (used at runtime)
- `.mxtest/snapshots/` — saved SQL dumps

Commands:

- `mxtest db connect` — interactively configure an external Postgres (host, port, db, user, password). Password is saved in `.mxtest/.env` and connection saved to `.mxtest/config.json`.
- `mxtest db status` — test and show DB connection status.
- `mxtest snapshot save <name>` — produce a SQL dump (uses `pg_dump`) and store it in `.mxtest/snapshots/<name>.sql`.
- `mxtest snapshot list` — list available snapshots.
- `mxtest snapshot restore <name>` — restore a snapshot using `psql` (overwrites DB data).

Notes and requirements:

- `pg_dump` and `psql` must be available on PATH for snapshot operations (these are the Postgres client tools).
- `mxtest` stores the DB password in `.mxtest/.env` for convenience; treat `.mxtest` like a local secret store and add it to `.gitignore` if needed.

### How run-build uses the DB config

`mxtest run-build` detects whether your project is configured to use an external database (via `.mxtest/config.json`). If an external DB is configured the CLI will:

- write a temporary compose override (`.docker/docker-compose.mxtest.override.yml`) that injects the external DB connection into the Mendix service environment variables (so the runtime connects to your external Postgres), and
- scale down the local `db` service (so local Postgres is not started by compose).

This means you can run the same `mxtest run-build` workflow whether you use the bundled Postgres or an external DB.

### Using snapshots when testing

You can restore a snapshot before running tests:

```powershell
mxtest snapshot restore baseline
mxtest run-build
mxtest test --snapshot baseline
```

`mxtest test` also accepts `--snapshot <name>`; when specified the CLI will restore the snapshot automatically before running the tests.

## Quick workflow (with DB + snapshots)

1. Connect to an external DB (one-time per project):

```powershell
mxtest db connect
```

2. Save a baseline snapshot:

```powershell
mxtest snapshot save baseline
```

3. Rebuild and start with the configured DB:

```powershell
mxtest run-build
```

4. Run tests using a snapshot:

```powershell
mxtest test --snapshot baseline
```

## Security and notes

- `.mxtest/.env` contains the DB password in plain text for convenience; consider using OS keychains, encrypted stores, or CI secrets for production workflows.
- Snapshot restore is destructive — it will overwrite the target database. Use with caution.


Notes:
- `mxtest run` intentionally does not attempt to pull remote images. It expects `mxtest build` (or `run-build`) to produce local build artifacts, and will use those local images. If you intentionally want to use a remote image instead of local artifacts, set `image` in `mxtest.config.json` or run a custom compose.
- `mxtest run-build` will try to stop any prior stack and remove local images created by that stack before rebuilding to avoid stale image/container issues.

## Quick workflow

1. Build artifacts:

```powershell
mxtest build 8080 5432
```

2. Start the prepared stack (uses local build artifacts):

```powershell
mxtest run
```

3. Or force rebuild and restart:

```powershell
mxtest run-build
```

4. Run Playwright tests:

```powershell
mxtest test
```

## Configuration

The CLI stores settings in `mxtest.config.json` at the project root. To view:

```powershell
mxtest config show
```

To update a setting:

```powershell
mxtest config set <key> <value>
# example:
mxtest config set clientPort 9090
```

Allowed keys: `testDir`, `appUrl`, `clientPort`, `postgresPort`, `waitTimeout`, `image`.

## Templates

Templates are under `src/templates/` and are used to create `.env`, `.docker/docker-compose.yml`, and a sample test file during `mxtest init` or `mxtest build`.

## Development

- Node.js (CommonJS) only
- Dependencies are defined in `package.json`

## Contributing

Open a PR on the repository and include tests for new features.

---
Updated README to reflect current CLI commands and behavior.
