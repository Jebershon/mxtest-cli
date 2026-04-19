# mxtest-cli

Mendix + Playwright testing CLI. This tool helps build Mendix docker artifacts, start containers, run Playwright tests and produce HTML reports. It also provides robust PostgreSQL snapshot/save/restore helpers that work when the DB runs inside Docker Compose.

## Features
- Verify environment (mxcli, Docker, Playwright)
- Initialize a test folder with a sample Playwright test (now under `.mxtest/tests` by default)
- Build Mendix Docker artifacts and prepare `.docker`
- Start/stop the project's docker compose stack
- Run Playwright tests and generate HTML reports (reports saved under `.mxtest/test-results`)
- Manage `mxtest.config.json` settings
- Save/restore PostgreSQL snapshots that work for DB-in-container and external DB workflows

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
- `mxtest init` — initialize testing scaffolding (detects `.mpr`, creates `.mxtest/tests/sample.spec.js` by default and ensures `.mxtest/config.json`).
- `mxtest build [clientPort] [postgresPort]` — run `mxcli docker build` and prepare `.docker` (writes `.docker/.env` and `.docker/docker-compose.yml` from templates when appropriate).
- `mxtest run` — start the prepared `.docker` compose stack. This command expects local build artifacts (a `.docker/build` folder and `.docker/docker-compose.yml`) produced by `mxtest build`. It will run `docker compose up -d` in `.docker`. If a port conflict occurs it calls `docker compose down` then retries `up -d` once.
- `mxtest run-build [--no-wait]` — force a clean rebuild: stops any existing stack, removes `.docker`, runs `mxtest build`, builds local images (`docker compose build`) and starts the stack (`docker compose up -d`). On subsequent runs when an internal Postgres is used the command will automatically save a baseline snapshot (to `.mxtest/snapshots`) before teardown and attempt to restore it after `docker compose up` to preserve data across rebuild cycles.
- `mxtest test [options]` — run Playwright tests (supports `--path`, `--url`, `--headed`, `--browser`, `--retry`, `--ci`, `--no-report`). Reports and parsed results are written to `.mxtest/test-results/<timestamp>/`.
- `mxtest result` — open/show the last Playwright report.
- `mxtest down` — stop the docker compose stack in `.docker`.
- `mxtest status` — show container status for the stack.
- `mxtest logs [--tail N] [--follow]` — show docker compose logs.
- `mxtest config [show|set]` — view or update `mxtest.config.json` (allowed keys: `testDir`, `appUrl`, `clientPort`, `postgresPort`, `waitTimeout`, `image`).
- `mxtest playwright [...args]` — pass-through to `npx playwright`.

### Database & snapshots

The CLI supports both internal (Compose-provided) and external PostgreSQL configurations and provides robust snapshot tooling that works when the DB is inside Docker Compose. The tool stores per-project state under a hidden `.mxtest/` folder in the project root. That folder contains:

- `.mxtest/config.json` — DB mode and connection info
- `.mxtest/.env` — stored DB password (used at runtime)
- `.mxtest/snapshots/` — canonical snapshots (`.backup`) and a single overwritten safety copy in `.mxtest/snapshots/sql/` (`<name>.sql`)

Snapshot behavior and commands:

- Default snapshot format: `.backup` (pg_dump -Fc). When a `.backup` is created the CLI also writes a single overwritten plain SQL safety copy at `.mxtest/snapshots/sql/<name>.sql` to ease inspection and simple restores.
- `mxtest db connect` — interactively configure an external Postgres (host, port, db, user, password). Password is saved in `.mxtest/.env` and connection saved to `.mxtest/config.json`.
- `mxtest db status` — test and show DB connection status.
- `mxtest snapshot save <name>` — save a snapshot to `.mxtest/snapshots/<name>.backup` (default) or `.sql` when requested.
- `mxtest snapshot list` — list available snapshots.
- `mxtest snapshot restore <name>` — restore a snapshot (prefers `.backup` if both exist).
- `mxtest db restore-backup` — interactive helper to import an external `.backup`/`.sql` file into the project: choose from defaults, pick an existing path, or provide a file path; the file is copied into `.mxtest/snapshots` and restored.

In-container snapshot (internal DB only):

- Use `mxtest snapshot save <name>` to create a snapshot from the Postgres database running inside your project's Docker Compose (only when the project DB mode is internal).
- The command runs `pg_dump` inside the DB container, copies the resulting `.backup` to `.mxtest/snapshots/<name>.backup`, and attempts to write a plain SQL safety copy to `.mxtest/snapshots/sql/<name>.sql`.
- Example:

```powershell
mxtest snapshot save baseline
# produces .mxtest\snapshots\baseline.backup
# and (when possible) .mxtest\snapshots\sql\baseline.sql
```

Note: `mxtest snapshot save` will refuse to run when your project is configured to use an external DB (see `.mxtest/config.json`).

Implementation notes and fallbacks:

- The CLI uses the system Postgres client tools (`pg_dump`, `pg_restore`/`psql`) rather than a Node `pg` dependency. Ensure those CLIs are available on PATH for snapshot operations.
- When the database runs inside Docker Compose the snapshot manager will attempt, in order:
	1. Native host calls to `pg_dump`/`psql` (when host can reach the DB),
	2. `docker compose exec <db>` streaming with environment injection (preferred for containerized DB),
	3. `docker run` with the official Postgres image as a last-resort fallback.
- These fallbacks improve reliability when containers change network namespaces or credentials.

Notes:

- Snapshot restore is destructive — it will overwrite the target database. Use with caution.
- Treat `.mxtest` as local project secrets and add it to `.gitignore` where appropriate.

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

2. Save a baseline snapshot (recommended before disruptive changes):

```powershell
mxtest snapshot save baseline
```

3. Rebuild and start (for internal DBs the CLI auto-saves/restores baseline across rebuilds):

```powershell
mxtest run-build
```

4. Run tests using a snapshot (the CLI can auto-restore when `--snapshot` is provided):

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
