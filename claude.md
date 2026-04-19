# mxtest-cli — Project Overview for Claude-style agents

This document explains the mxtest-cli project: its responsibilities, key flows, file layout, and design choices. It's written to help an agent (or developer) quickly understand how the tool works and where to make changes.

## Purpose

mxtest-cli is a command-line tool that automates building Mendix applications (via `mxcli`), preparing Docker artifacts, starting a local stack, and running Playwright tests. It includes utilities for managing DB connections, snapshots, and test reporting.

The project is intentionally small, CommonJS-based, and designed to be used locally or in CI.

## High-level architecture

- `bin/index.js` — CLI entrypoint (commander) that registers commands.
- `src/commands/*` — command implementations (doctor, init, build, run, run-build, test, db, snapshot, etc.).
- `src/utils/*` — reusable utilities: validator, waitForApp, logger, configManager, dbManager, snapshotManager, reportGenerator.
- `.mxtest/` (per-project hidden storage) — created at runtime to hold `config.json`, `.env`, and `snapshots/`.
- `.docker/` (project docker artifacts) — created by `mxcli` or by `mxtest build` and used by `mxtest run`/`run-build`.

## Primary flows

1. Initialization
   - `mxtest init` inspects the repo (finds `.mpr`), creates a `tests/` folder with a sample Playwright test, and ensures basic config.

2. Build
   - `mxtest build [clientPort] [postgresPort]` runs `mxcli docker build -p <mpr>` and captures its output. It ensures `.docker` is fresh and writes `.docker/.env` and `.docker/docker-compose.yml` from templates when appropriate.

3. Run (local)
   - `mxtest run` expects `.docker/build` and `.docker/docker-compose.yml` to exist (local build artifacts). It runs `docker compose up -d` in `.docker`. If a port conflict occurs it calls `docker compose down` then retries `up -d` once. It does not pull remote images.

4. Run-build (force rebuild)
   - `mxtest run-build` attempts to stop any existing stack, remove `.docker`, run `mxtest build`, optionally rewrite compose to prefer local `build:` context when Dockerfile is present, runs `docker compose build`, then `docker compose up -d`. It also supports external DB wiring (see DB section).

5. Tests
   - `mxtest test` runs Playwright via `npx playwright test` with `--reporter=json`. The JSON output is parsed, saved under `test-results/<ts>/`, and converted to an HTML report. `npx playwright show-report` is called to serve the report. The report generator writes `report.html` and `index.html` to avoid 404s.

6. DB & snapshots
   - `.mxtest/config.json` stores DB mode and connection info. `.mxtest/.env` stores DB password.
   - `mxtest db connect` prompts the user and saves credentials. `mxtest db status` checks connectivity.
   - Snapshot functions (`mxtest snapshot save|list|restore`) use `pg_dump` and `psql` to manage SQL dumps in `.mxtest/snapshots/`.
   - When DB mode is `external`, `mxtest run-build` writes a temporary compose override under `.docker/` that injects the external DB connection into the Mendix service and scales local `db` down.

## Key files to inspect when making changes

- `src/commands/run-build.js` — complex orchestration of build, compose, and DB override logic.
- `src/commands/run.js` — starts the stack using local artifacts (strict behavior).
- `src/commands/build.js` — invokes `mxcli`, streams logs, and prepares `.docker` artifacts.
- `src/commands/test.js` and `src/utils/reportGenerator.js` — Playwright invocation and HTML report generation.
- `src/utils/dbManager.js` and `src/utils/snapshotManager.js` — DB config and snapshot primitives.
- `src/templates/*.txt` — templates used to generate `.env` and `docker-compose.yml`.

## Agent guidance (how an agent should approach development)

- Read the high-level flows before editing any file.
- Prefer small, well-scoped patches: unit changes to a single command or util at a time.
- Use existing utilities (`logger`, `configManager`, `waitForApp`) rather than rolling ad-hoc variants.
- When modifying compose behavior, prefer writing temporary override files inside `.docker` (not altering user repo files) so actions are reversible.
- Keep security in mind: `.mxtest/.env` is local and may contain passwords. Avoid logging secrets.

## Testing locally

1. Install dependencies and link the CLI (dev):

```powershell
cd C:\Projects\custom-cli\mxtest-cli
npm install
npm link
```

2. Validate environment:

```powershell
mxtest doctor
```

3. Build and run:

```powershell
mxtest build
mxtest run
```

Or force rebuild:

```powershell
mxtest run-build
```

4. Run tests:

```powershell
mxtest test
```

## Future improvements (short list)

- Support encrypted storage for `.mxtest/.env` (OS keychain integration).
- Better detection of mxcli artifact layout and more robust compose generation.
- Add CI-friendly flags (non-interactive db connect, snapshot in/out via env).
- Add automated tests for run/build flows (mock execa or spawn and assert commands).
- Add telemetry and structured logs for debugging complex orchestration.

---
This file is intended to be read by another agent or developer to quickly onboard and continue work on the project.
