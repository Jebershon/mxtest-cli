# agents.md — How to act on the mxtest-cli repository

This document is a practical playbook for autonomous agents (or human developers acting like agents) who will work on mxtest-cli. It lists typical tasks, actionable checkpoints, conventions, and an ordered backlog of future features.

**Status**: v1.0.0 Release Ready (2026-04-20)

## Goals for an agent

- Keep the CLI reliable: building, starting, and testing must be robust on developer machines and CI.
- Maintain clear, reversible changes — prefer temporary `.docker` overrides to in-place repo edits.
- Keep secrets local and out of Git history.
- Support Claude Code CLI integration for test generation and automation.

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
7. Test `mxtest generate --dry-run` to ensure Claude integration still works (or test with `--mock`).
8. Verify new/generated tests appear in `.mxtest/tests/generated/` and `codegenerate` output goes to `.mxtest/tests/auto/`.

## Common tasks and where to start

- Add a new command
  - Add `src/commands/mycmd.js` exporting a function and register it in `bin/index.js`.
  - Use existing utils for prompts and logging.

- Improve test generation (Claude integration)
  - Inspect `src/commands/generate.js` for orchestration.
  - Inspect `src/utils/claudeRunner.js` for Claude Code CLI invocation (stdin piping for large prompts).
  - Inspect `src/utils/projectScanner.js` for Mendix project analysis.
  - Update `src/skills/mendix-widgets.skill.md` to add new widget patterns (DatePicker, ComboBox, Dropdown, DataGrid patterns already included).
  - Test with `--mock <path>` for token-safe pipeline testing.
  - Test with `--dry-run` to preview without writing files.

 - Improve DB snapshot reliability
  - Inspect `src/utils/snapshotManager.js`. The implementation should prefer native host `pg_dump`/`psql`, then `docker compose exec` streaming with environment injection, then `docker run` as a last-resort fallback.
  - Ensure snapshots are saved as `.backup` (default) and that the single overwritten plain-SQL safety copy in `.mxtest/snapshots/sql/` is produced.
  - Add checksum validations for saved snapshots.

 - Add non-interactive CI flags
  - Snapshot and restore commands should support non-interactive flags (e.g., `--yes` and explicit `--path`) so CI runs can skip interactive prompts.

- Add tests
  - Create lightweight unit tests using mocha/jest for utils (avoid integration tests that require Docker unless running in specialized CI).
  
- Enhance Docker Compose behavior
  - Review `src/commands/run-build.js` for external DB override logic and docker compose argument ordering.
  - **FIXED (v1.0.0)**: docker compose `-f` flags now correctly placed before `up` subcommand.

## Backlog (prioritized)

### Completed in v1.0.0
- ✅ Test generation with Claude Code CLI integration
- ✅ Deep Mendix project analysis (modules, widgets, JS actions)
- ✅ Enhanced skill with custom widget patterns
- ✅ Dry-run and mock modes for test generation
- ✅ File organization fix (all tests under `.mxtest/tests/`)
- ✅ Codegenerate viewport sizing fix (1280x1024)
- ✅ Docker compose argument ordering fix for external DB

### Post-v1.0.0 Priorities
1. Encrypt `.mxtest/.env` using OS keychain APIs (Windows Credential Manager, macOS Keychain, Linux secret service).
2. Add `--ci`/`--non-interactive` flags to all commands that currently prompt.
3. Implement a dry-run mode for `run-build` and `run` to output the exact Docker Compose commands and overrides without executing them.
4. Expand Playwright integration: add `--grep` and parallelization options.
5. Implement more targeted compose rewrites: only alter the Mendix app service instead of global replacement.
6. Add auto-installation of Playwright browsers via `mxtest install-playwright` command.
7. Webhook support for test result notifications to Slack/Teams.
8. Custom test reporter plugins.
9. Mendix module-specific test pattern library expansion.

## Troubleshooting tips

- If `mxtest run` fails with "no Docker build artifacts found": check the `.docker` folder in the project root — it must contain a `build/` subfolder and `docker-compose.yml`. Use `mxtest run-build` to create them.
- If Playwright shows a 404 for the report: confirm `src/utils/reportGenerator.js` writes `index.html` alongside `report.html` in the report output dir.
- If snapshot restore fails: verify `pg_dump`/`psql` are on PATH and the service is reachable from the machine running the command.

## Example agent workflow for a feature (end-to-end)

1. Create a branch `feat/<short-desc>`.
2. Implement the change in `src/` with small commits.
3. Run local smoke tests: `mxtest doctor`, `mxtest build`, `mxtest run-build`, `mxtest test`.
4. For test generation features: test with `mxtest generate --mock --dry-run` and `mxtest generate --dry-run` (if Claude integration available).
5. Add/adjust unit tests if behavior changed.
6. Update `claude.md` and `agents.md` if the change affects developer experience.
7. Submit PR with description and testing steps.
8. All 14 smoke tests in `/tmp/smoke_test.sh` must pass before merging.

## Notes about automation and CI

- CI should install system deps (Docker, pg_dump, psql) or mock those steps.
- For CI, prefer `mxtest build` to run in a containerized environment where necessary tools exist.
- Claude Code CLI integration requires `claude` binary on PATH (install via `npm install -g claude`).
- Test generation consumes Claude API tokens; use `--mock` or `--dry-run` for local testing without token cost.

## Release Notes (v1.0.0)

**Date**: April 20, 2026

- ✅ 14/14 smoke tests passing with C:\Mendix\AI-App-main project
- ✅ Full Claude Code CLI integration for automatic test generation
- ✅ All test files organized under `.mxtest/tests/` directory
- ✅ Fixed docker compose argument ordering for external database support
- ✅ Enhanced Playwright codegen with viewport sizing and proper output location
- ✅ Mock and dry-run modes for risk-free testing

---
Keep this file updated as the repository evolves; it's the single best place to codify agent workflows and expectations.
Last updated: 2026-04-20 (v1.0.0 Release)
