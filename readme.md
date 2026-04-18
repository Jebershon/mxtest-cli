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
