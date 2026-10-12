# Shared implementation contract

All endpoints below use `/api`. JSON responses are the entity itself (not envelope). Lists are arrays. Errors `{error:{code,message,requestId}}`. Access bearer tokens expire after 15 minutes; web refresh uses HttpOnly cookie; extension requests `X-Client: extension` and receives refreshToken in JSON. Extension stores tokens in chrome.storage.session only. Origins explicitly allowlisted. API default port 4000, Vite 5173 proxies /api; production API serves built SPA. All private IDs owner scoped. Dates are ISO date strings or empty string; timestamps ISO. Shared TS types in packages/shared/src/index.ts are the canonical contract; do not change without coordinating.

## Routes
- POST /auth/register {email,password,fullName} -> AuthResponse (201); accounts immediately active (no claim of email verification).
- POST /auth/login {email,password} -> AuthResponse
- POST /auth/refresh {refreshToken?} -> AuthResponse (cookie for web)
- POST /auth/logout {refreshToken?} -> 204 (revoke session)
- GET /auth/me -> User
- GET /profile -> Career
- PUT /profile Profile -> Profile
- POST /profile/:section EntryInput -> Entry (201); PUT /profile/:section/:id EntryInput -> Entry; DELETE -> 204. Sections enum from shared. Entries only become verified by explicit user save; resume text never auto imports. Position controls order.
- GET /resumes -> Resume[]
- POST /resumes multipart `file`, optional `name`, optional `resumeId` -> ResumeVersion (201). Supported PDF, DOCX, and TXT, 5 MiB. New resume grouping unless resumeId supplied. Extracted text returned untrusted; manual review/copy into profile.
- POST /resumes/versions/:id/parse -> ResumeParseResult. Uses the configured backend parser (`none`, Gemini, OpenAI-compatible, or APILayer original-file upload); output is always review-only and never mutates profile data. APILayer accepts PDF/DOCX (TXT receives 415) and provider errors return a safe error response rather than an apparent successful fallback.
- GET /resumes/versions/:id/download -> attachment
- DELETE /resumes/:id -> 204
- GET /jobs -> Job[]; POST /jobs JobInput -> Job (201); GET /jobs/:id -> Job; DELETE /jobs/:id -> 204
- POST /jobs/:id/analyze {} -> Analysis; GET /jobs/:id/analysis -> Analysis (404 when none)
- Job URL is stored for navigation; users paste text or extension captures it. No server arbitrary URL fetch (SSRF boundary).
- GET /applications -> Application[]; POST /applications applicationSchema -> Application (201); GET /applications/:id -> Application; PATCH /applications/:id applicationUpdateSchema -> Application; DELETE -> 204
- GET /applications/:id/events -> ApplicationEvent[]
- POST /applications/:id/confirm-submission {appliedAt?:ISO date,note?:string} -> Application; records one explicit user-confirmed submission event and moves the application to Applied. It never submits to an employer.
- POST /assist/answer {question:string,jobId?:uuid} -> Draft
- POST /assist/chat {question:string,jobId?:uuid} -> Draft (same grounded output, no invented factual prose)
- POST /applications/:id/interview {} -> InterviewPrep; GET /applications/:id/interview -> InterviewPrep (404 none); PATCH /applications/:id/interview {notes?:string,completed?:boolean} -> InterviewPrep
- GET /analytics -> Analytics
- GET /account/export -> complete authenticated user data JSON; DELETE /account {password} -> 204, cascading account deletion
- GET /health -> {status:'ok'}; GET /ready -> DB connectivity check

## Grounding
Production deterministic provider extracts job keywords and relevant lines, exact skill matches and selected profile evidence; answers composed ONLY from stored verified evidence, never invented first-person claims. Optional OpenAI-compatible provider may select evidence IDs only; output validated against supplied IDs, prose assembled by server. It must not emit unrestricted factual career prose. Provider failure falls back explicitly with warning. Jobs/resume/page text untrusted. UI labels job facts vs verified profile vs interpretation. No silent career mutations.

## Workspace ownership
T1 API agent owns apps/api only plus docs/api.md docs/authentication.md docs/database.md docs/ai-safety.md.
T2 web agent owns apps/web only plus docs/web.md.
T3 extension agent owns apps/extension only plus docs/extension.md.
T4 QA/deployment agent owns tests/, .github/, Dockerfile, compose.yml, .dockerignore, playwright.config.ts, docs/deployment.md, docs/testing.md, scripts/package-extension.mjs.
Coordinator owns root/shared/README/env and integration fixes after agents complete. Agents may install dependencies after package manifests are created, but do not edit root manifest or shared contracts. No nested agents.
