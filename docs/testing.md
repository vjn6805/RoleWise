# Verification and test boundaries

## Prerequisites

Use Node.js 22.16+, npm, and real PostgreSQL 17+ (local verification also uses PostgreSQL 18). Do not point any test database variable at production. API integration tests may clear test-owned tables. Browser tests create unique `@example.test` accounts and delete them in `finally` blocks; an interrupted process can leave synthetic accounts in the dedicated E2E database.

```sh
npm ci
npm exec playwright install chromium
# Linux CI also installs OS libraries:
# npm exec playwright install --with-deps chromium
```

Create two dedicated databases with your PostgreSQL administrator:

```sh
createdb career_test
createdb career_e2e
export TEST_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/career_test
export E2E_DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/career_e2e
export DATABASE_URL="$TEST_DATABASE_URL"
export JWT_SECRET=local-test-only-secret-at-least-48-characters-long-0123456789
export WEB_ORIGINS=http://localhost:5173
export NODE_ENV=test
npm run db:migrate
npm run typecheck
npm test
npm run build
npm run test:e2e
# Linux without a desktop session: xvfb-run --auto-servernum npm run test:e2e
```

PowerShell users set environment with `$env:E2E_DATABASE_URL='postgresql://…'` rather than `export`. Browser tests require a **built** web SPA and extension. They do not stub the API, use a SQLite substitute, or launch an unfinished Vite entrypoint.

## Browser server lifecycle

`playwright.config.ts` starts `npm run db:migrate && npm start` with a dedicated test-only API configuration at `http://127.0.0.1:4400`. This serves the actual built SPA and API in one process, exercising the root production entrypoint while using test-mode cookies for loopback HTTP. The real application fixture runs at `http://localhost:4174`. Servers are not reused: occupied ports fail visibly instead of accidentally testing another agent's or developer's process. Playwright stops both owned processes afterward. Test database URLs must be supplied explicitly using `E2E_DATABASE_URL`.

`E2E_API_URL`, `E2E_BASE_URL`, and `E2E_FIXTURE_URL` override endpoints. API and fixture **hostnames must differ** for extension permission-isolation assertions. The default `127.0.0.1` API and `localhost` fixture accomplish this. `E2E_EXTERNAL_SERVERS=1` opts out of managed API startup only; you then own API/web lifecycle, migrations, and configuration, including the exact test extension origin from `tests/fixtures/extension-identity.ts`. The fixture remains test-managed.

## Browser coverage

### Web workspace (`tests/e2e/workspace.spec.ts`)

The critical user path drives actual labeled controls and checks real HTTP responses:

- Register an active account, sign out, verify protected-route redirect, and sign back in.
- Save basic profile plus verified skill, experience, and project entries; reload to verify database persistence.
- Upload and review a real multipart TXT resume containing an unsupported career claim. Check the full verified profile is unchanged by extraction.
- Save a job with adversarial employer text and analyze it. Check exact skill matches and that every cited evidence ID belongs to the verified profile.
- Track the job with an assigned resume version, update stage and notes, and verify stage history.
- Generate evidence-linked interview questions, save practice notes/completion, and reload them.
- Load real analytics and verify the application count/stage distribution.
- Request a grounded draft, assert evidence ownership and absence of the unsupported resume/job claim, and verify no career facts were silently changed.

### Native Chromium extension (`tests/e2e/extension.spec.ts`)

This is not a mocked `chrome` object or a page overlay. The test launches a persistent headed Chromium profile with the built unpacked Manifest V3 extension, runs its real service worker and panel bundle, signs in against the real API, captures a real HTTP page using `chrome.scripting` in the isolated world, and fills actual native inputs.

The shipped manifest is first asserted to have no required host permissions, no content scripts, and no `tabs` permission. A **temporary copy** receives a stable public test identity and a required permission for **only the backend hostname**, avoiding automated interaction with Chrome's native optional-permission prompt. The production extension is not modified. The fixture uses a different hostname, has no host grant, and capture is verified to fail before action activation. `Extensions.triggerAction` through Chromium's debugging protocol invokes the real extension action and its `activeTab` grant; no broad job-site permission is injected. The test requires the installed recent Playwright Chromium that supports this debugging command.

The same shipped panel document is driven through the extension's supported `panel.html?sourceTab=…` fallback tab. Chromium's native side-panel chrome is not a normal Playwright Page. This verifies panel logic and real browser permissions/injection, but **does not claim automated coverage of native side-panel visual placement, Chrome's permission dialog, or a human toolbar click**. Those remain manual checks. Debugging flags and test identity are never packaged.

Assertions cover capture review, real opportunity save/analyze/application tracking, grounded draft citations, all detected fields initially unselected, blocked sensitive fields absent, no mutation before final confirmation (including cancellation), filling only selected contact fields, stale/mutated field rejection, unchanged hidden/disabled/consent/upload/sensitive inputs, session-only tokens, logout cleanup, and unchanged verified career data. Both the page submit counter and a real HTTP `/submit` counter remain zero. As disclosed in the UI, arbitrary third-party page event handlers can themselves react to input/change; no extension can guarantee that a hostile website will never send a network request in response to an input event.

## Diagnostics and artifacts

Playwright retains failure screenshots/traces, including the native persistent extension context, under its test output directory. Inspect with `npm exec playwright show-trace path/to/trace.zip`. CI uploads diagnostics only on failure and the downloadable release ZIP on success. Traces contain synthetic account data and request details; do not run these tests with real personal data or production credentials.

CI provisions PostgreSQL, creates a separate E2E database, runs typecheck/unit/integration/build/browser checks, and then builds and boots the production Docker image. The container smoke checks database readiness after migration, SPA deep-link serving, and ZIP download integrity. The workflow definition alone is not evidence that a GitHub Actions run has passed.

## Manual release checks

- Install the release ZIP from `/downloads/career-copilot-extension.zip` into a clean Chrome/Edge profile. Confirm Developer-mode steps are accurate; there is no automatic install or claimed store listing.
- Allowlist the installed extension ID on the backend, save its API URL, and explicitly approve the narrow backend permission prompt. Decline once to verify a useful error and no request.
- Click the actual toolbar action on an ordinary job page. Confirm native side-panel behavior, capture only after your click, safe failure on browser-internal/store pages, and the fallback where side panels are unavailable.
- Test representative third-party forms manually, especially framework controls and unsupported cross-origin iframes/custom widgets. Unsupported fields should remain untouched. Review before final confirmation; submit manually only when ready.
- Verify HTTPS proxying, secure refresh cookies, backup restoration, migrations, and access restrictions in the actual deployment. No local browser run certifies TLS/proxy, high availability, external AI service reliability, or browser-store publication.

## Local execution record

Pending final browser execution; see the T4 section of `.omnirush/swarm.md` during implementation. This section will be updated with actual commands and results, not inferred passes.
