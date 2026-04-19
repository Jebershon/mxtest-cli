# agents.md — How to act on the mxtest-cli repository

This document is a practical playbook for autonomous agents (or human developers acting like agents) who will work on mxtest-cli. It lists typical tasks, actionable checkpoints, conventions, and an ordered backlog of future features.

## Goals for an agent

- Keep the CLI reliable: building, starting, and testing must be robust on developer machines and CI.
- Maintain clear, reversible changes — prefer temporary `.docker` overrides to in-place repo edits.
- Keep secrets local and out of Git history.

## Conventions

- Use CommonJS (require/module.exports) to match the repo style.
- Prefer small patches that include tests when behavior changes.
- Do not commit secrets from `.mxtest` — `.mxtest` should be in `.gitignore` (verify if present).
- When calling external binaries, capture and stream output via existing `logger` helpers. Prefer using the system Postgres client tools (`pg_dump`, `pg_restore`/`psql`) for snapshot operations rather than embedding DB clients in Node.

## Quick checklist for any PR/patch

1. Run `npm install` locally and ensure `npm test` (if tests exist) passes.
2. Run `mxtest doctor` to ensure dependencies are available.
3. Try `mxtest build` and `mxtest run` in a Mendix app with a simple `.mpr` to validate end-to-end.
4. Run `mxtest test` (Playwright) and confirm an HTML report is produced and served.
5. Verify snapshot save/restore flows (`mxtest snapshot save|list|restore`) work when the DB runs inside Docker Compose and for external DBs.
6. If changing compose or Docker logic, run in a disposable docker environment (or CI) and verify no unexpected images are pulled.

## Common tasks and where to start

- Add a new command
  - Add `src/commands/mycmd.js` exporting a function and register it in `bin/index.js`.
  - Use existing utils for prompts and logging.

 - Improve DB snapshot reliability
  - Inspect `src/utils/snapshotManager.js`. The implementation should prefer native host `pg_dump`/`psql`, then `docker compose exec` streaming with environment injection, then `docker run` as a last-resort fallback.
  - Ensure snapshots are saved as `.backup` (default) and that the single overwritten plain-SQL safety copy in `.mxtest/snapshots/sql/` is produced.
  - Add checksum validations for saved snapshots.

 - Add non-interactive CI flags
  - Snapshot and restore commands should support non-interactive flags (e.g., `--yes` and explicit `--path`) so CI runs can skip interactive prompts.

- Add tests
  - Create lightweight unit tests using mocha/jest for utils (avoid integration tests that require Docker unless running in specialized CI).

## Backlog (prioritized)

1. Encrypt `.mxtest/.env` using OS keychain APIs (Windows Credential Manager, macOS Keychain, Linux secret service).
2. Add `--ci`/`--non-interactive` flags to all commands that currently prompt.
3. Implement a dry-run mode for `run-build` and `run` to output the exact Docker Compose commands and overrides without executing them.
4. Expand Playwright integration: add `--grep` and parallelization options.
5. Implement more targeted compose rewrites: only alter the Mendix app service instead of global replacement.

## Troubleshooting tips

- If `mxtest run` fails with "no Docker build artifacts found": check the `.docker` folder in the project root — it must contain a `build/` subfolder and `docker-compose.yml`. Use `mxtest run-build` to create them.
- If Playwright shows a 404 for the report: confirm `src/utils/reportGenerator.js` writes `index.html` alongside `report.html` in the report output dir.
- If snapshot restore fails: verify `pg_dump`/`psql` are on PATH and the service is reachable from the machine running the command.

## Example agent workflow for a feature (end-to-end)

1. Create a branch `feat/<short-desc>`.
2. Implement the change in `src/` with small commits.
3. Run local smoke tests: `mxtest doctor`, `mxtest build`, `mxtest run-build`, `mxtest test`.
4. Add/adjust unit tests if behavior changed.
5. Update `claude.md` and `agents.md` if the change affects developer experience.
6. Submit PR with description and testing steps.

## Notes about automation and CI

- CI should install system deps (Docker, pg_dump, psql) or mock those steps.
- For CI, prefer `mxtest build` to run in a containerized environment where necessary tools exist.

---
Keep this file updated as the repository evolves; it's the single best place to codify agent workflows and expectations.
