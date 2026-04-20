# mxtest-cli

Mendix + Playwright testing CLI — build Mendix docker artifacts, start a local stack, run Playwright tests, and manage DB snapshots. Includes an AI-driven test-generation flow (`mxtest generate`) that can produce Playwright specs from a project scan and a skill template.

## Key features
- Environment checks (`mxtest doctor`) for required tools
- Project initialization and sample tests (`mxtest init`)
- Build and run Mendix Docker artifacts (`mxtest build`, `mxtest run`, `mxtest run-build`)
- Run Playwright tests and generate HTML reports (`mxtest test`, `mxtest report`)
- DB snapshot/save/restore helpers that work for in-container and external Postgres
- AI-driven test generation: `mxtest generate` (uses a skill template; supports `--mock` and `--dry-run`)

## Installation

Install dependencies and link the CLI for local development:

```powershell
cd C:\Projects\custom-cli\mxtest-cli
npm install
npm link
```

After `npm link` the `mxtest` command will be available globally.

## Primary commands (short)

- `mxtest doctor` — verify required tools (mxcli, Docker, Playwright).
- `mxtest init` — create `.mxtest` scaffolding and a sample test.
- `mxtest build [clientPort] [postgresPort]` — run `mxcli docker build` and prepare `.docker`.
- `mxtest run` — start the prepared `.docker` compose stack.
- `mxtest run-build [--no-wait]` — force rebuild and run the stack.
- `mxtest test [options]` — run Playwright tests (`--path`,`--url`,`--headed`,`--browser`,`--retry`,`--ci`,`--no-report`).
- `mxtest report` — open the latest HTML report.
- `mxtest down` — stop the docker compose stack.
- `mxtest status` — show container status.
- `mxtest logs [--tail N] [--follow]` — view compose logs.
- `mxtest config [show|set]` — view/update `mxtest.config.json`.
- `mxtest generate` — AI-powered test generation (see below).
- `mxtest codegenerate [url]` — launch Playwright recorder and save a generated script to a file (use `--output` to set destination).
- `mxtest snapshot [save|list|restore]` — manage DB snapshots.
 - `mxtest debug [target]` — run Playwright in interactive inspector/debug mode (sets `PWDEBUG=1`). Use `target` to specify a file or folder (defaults to `tests`).

## AI-driven test generation (`mxtest generate`)

The `generate` command can produce Playwright test files from a project scan using a skill template. By default it uses `src/skills/playwright.skill.md`. For complex UIs (data grids, nested widgets, modals, iframes) use the specialized `src/skills/playwright-complex-ui.skill.md`.

Options:
- `--skill <path>` — path to a skill template (defaults to `src/skills/playwright.skill.md`).
- `--mock <path>` — use a local mock file instead of calling Claude (for offline testing).
- `--dry-run` — parse and print generated specs without writing files.
- `--flow <name>` — name the generated flow (used for filenames).
- `--page <name>` — limit generation to a single page.
- `--output <dir>` — output directory (defaults to the configured `testDir` or `tests/generated`).

Examples:

```powershell
# dry-run with a mock Claude output
mxtest generate --output .mxtest/tests --dry-run --mock dev-resources/mock-claude-output.txt

# generate using the complex-UI skill and write to tests/generated
mxtest generate --skill src/skills/playwright-complex-ui.skill.md --output tests/generated --flow order-management
```

Notes:
- Skill templates are Markdown files that instruct the AI to emit only fenced JavaScript code blocks where the first line of each block is `// FILE: <filename>.spec.js`.
- Always review generated specs before running them. Generated tests are a starting point and may need project-specific selectors or test-data setup.

## Skill templates

Two bundled skills are included:

- `src/skills/playwright.skill.md` — general-purpose Playwright test template (login, navigation, simple forms).
- `src/skills/playwright-complex-ui.skill.md` — advanced templates and patterns for complex widgets (data grids, nested forms, modals, iframes, file uploads).

Skill templates use placeholders:

- `__PROJECT_CONTEXT__` — JSON summary of pages, widgets, and existing tests returned by the project scanner.
- `__EXISTING_TESTS__` — comma-separated list of existing test filenames (so AI avoids duplication).
- `__PAGES__` — comma-separated list of pages the generator should target.

To use a custom skill file, pass `--skill` to `mxtest generate` with the path to your template.

## Quick Playwright flows

Record a quick script (recorder) and save it to `tests/auto`:

```powershell
mxtest record --output tests/auto --url http://localhost:8080
```

Run tests (example):

```powershell
mxtest test --path tests --url http://localhost:8080 --browser chromium --headed
```

Open the most recent test report:

```powershell
mxtest report
```

## Snapshots and DB notes

The snapshot system uses `pg_dump`/`pg_restore` (or `psql`) and prefers native host tools when available. When Postgres runs inside Docker Compose the snapshot manager will attempt `docker compose exec` streaming and fall back to `docker run` with the Postgres image.

## Contributing to skill templates

- Skill templates are plain Markdown files under `src/skills/`.
- When editing skills, keep the `Output Rules` (only fenced JS blocks) so the CLI's parser can reliably extract generated files.
- Add examples and edge cases (e.g., pagination, virtual lists, file uploads) to the complex-UI skill to improve generation quality.

---
Updated: added AI-driven generation documentation and complex-UI skill guidance.
