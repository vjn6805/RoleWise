# RoleWise

RoleWise is a personal Career Operating System for managing verified career information, reviewing job opportunities, preparing applications, and filling supported application forms with explicit user confirmation.

The product is designed around one important rule:

> Resume text and AI suggestions are untrusted reference material until the user reviews and saves them as verified profile data.

The application never automatically submits a job application.

## Current capabilities

- Career profile with personal details, experience, projects, skills, certifications, achievements, links, and structured education.
- Resume upload for PDF, DOCX, and UTF-8 TXT files up to 5 MiB.
- Resume text extraction and reviewable suggestions for:
  - Name, email, and phone.
  - LinkedIn, GitHub, and other links.
  - Education and qualification details.
  - Skills, projects, experience, certifications, and achievements.
- Structured education fields:
  - Qualification type such as 10th, 12th/HSC, Diploma, Bachelor’s, Master’s, and Doctorate.
  - Institution or college.
  - Board or university.
  - Specialization.
  - Dates and passing year.
  - Percentage or CGPA.
- Job storage and job-description analysis.
- Profile-backed job recommendations and optional SerpApi Google Jobs discovery.
- Evidence-grounded assistant drafts.
- Application tracking and interview preparation.
- Analytics and account export.
- Chrome/Edge Manifest V3 extension for reviewed field autofill.
- Explicit post-submission confirmation from the extension, synchronized to the application tracker.
- Explicit review before profile changes or extension autofill.

## Technology stack

- TypeScript
- React and Vite
- Fastify
- PostgreSQL 17+
- SQL migrations
- Zod validation
- Vitest
- Playwright
- Chrome/Edge Manifest V3 extension

## Repository structure

```text
.
├── apps/
│   ├── api/          Fastify API, PostgreSQL migrations, API tests
│   ├── extension/    Chrome/Edge Manifest V3 extension
│   └── web/          React web application
├── packages/
│   └── shared/       Shared schemas and TypeScript contracts
├── docs/             Deployment and testing documentation
├── scripts/          Packaging scripts
├── compose.yml       Docker Compose setup for PostgreSQL and production app
├── Dockerfile        Production container build
├── package.json      Root workspace scripts
└── README.md
```

## Prerequisites

For local development, install:

- Node.js 22.16 or later.
- npm.
- PostgreSQL 17 or later, or Docker Desktop.
- Microsoft Edge or Google Chrome for extension development.

Check Node.js:

```powershell
node --version
npm --version
```

The Node.js version should be at least `22.16.0`.

## Quick start with local PostgreSQL

These steps are for Windows PowerShell, but the commands also work from most terminals.

### 1. Clone the repository

```powershell
git clone https://github.com/vjn6805/RoleWise
cd RoleWise
```

Replace the GitHub URL with the URL of your repository.

### 2. Install dependencies

```powershell
npm ci
```

If the repository does not contain a lockfile yet, use:

```powershell
npm install
```

### 3. Create a PostgreSQL database

You can use pgAdmin or SQL Shell (`psql`). Connect to PostgreSQL as an administrator, usually the `postgres` user, and run:

```sql
CREATE USER career WITH PASSWORD 'career-password';
CREATE DATABASE career OWNER career;
```

If the user already exists, reset its password instead:

```sql
ALTER USER career WITH PASSWORD 'career-password';
```

If the database already exists, do not create it again.

The local connection URL is:

```text
postgresql://career:career-password@localhost:5432/career
```

### 4. Create the environment file

Create `.env` in the repository root. Never commit this file.

```dotenv
NODE_ENV=development
HOST=127.0.0.1
PORT=4000

DATABASE_URL=postgresql://career:career-password@localhost:5432/career

# Must be at least 32 characters.
JWT_SECRET=replace-this-with-a-long-local-development-secret

WEB_ORIGINS=http://localhost:5173
EXTENSION_ORIGINS=
TRUST_PROXY=false
```

Generate a secure local JWT secret with:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The application does not require an external AI provider for local development. Its deterministic grounding provider works without `AI_BASE_URL` or `AI_API_KEY`.

## Intelligent resume parsing

After upload, RoleWise calls its backend parser endpoint. With `RESUME_AI_PROVIDER=apilayer`, the backend sends the original resume file to APILayer; that provider receives the resume content. The deterministic and optional Gemini/OpenAI-compatible text parsers remain available when selected explicitly. The UI receives editable suggestions for the fields the selected parser actually returns.

The parser never writes directly to the career profile. Every suggestion must be reviewed and explicitly saved by the user. APILayer suggestions are accepted only when their values can be checked against the extracted resume text and pass shared validation. Unsupported fields stay in the extracted text for manual review.

### APILayer resume parser (optional)

Subscribe to the Resume Parser API at [APILayer](https://apilayer.com/marketplace/resume_parser-api). Rotate any key that has been posted publicly. Put the **replacement** key only in the root `.env`:

```dotenv
RESUME_AI_PROVIDER=apilayer
APILAYER_API_KEY=your-new-apilayer-key
```

Restart `npm run dev`, then upload a PDF or DOCX file under **Resumes**. APILayer supports PDF and Word resumes, not TXT; TXT uploads remain available for manual review or the other parsers. RoleWise sends the stored original file from the backend to APILayer's `/resume_parser/upload` endpoint as `application/octet-stream`; the browser never sees the provider key. Existing PDF/DOCX resumes can be parsed using **Parse again**. The parser label should read `apilayer`. Provider errors (key/subscription, quota, network, response) are shown as errors; uploads remain stored so you can retry without uploading again. APILayer's sample response contains name, email, skills, education and experience; it does **not** supply project bullets, certifications, professional links or full descriptions in that schema. Those stay in extracted text for manual review rather than being invented.

### Recommended optional provider

Gemini is a practical low-cost/free-tier option for development, but quotas and model availability vary by account, region, and time. Do not assume unlimited usage. Configure it only on the backend:

```dotenv
RESUME_AI_PROVIDER=gemini
GEMINI_API_KEY=your-gemini-key
GEMINI_MODEL=gemini-3.1-flash-lite
```

For Groq or another OpenAI-compatible provider:

```dotenv
RESUME_AI_PROVIDER=openai-compatible
AI_BASE_URL=https://api.groq.com/openai/v1
AI_API_KEY=your-provider-key
AI_MODEL=your-structured-output-model
```

For Gemini and OpenAI-compatible parsing, an unavailable provider or invalid structured response falls back to the deterministic parser with a warning. APILayer reports these failures as errors so a failed provider request cannot look like a successful parse. No fake profile data is generated.

External job search is optional. To enable the **Recommended jobs → Search jobs** flow, add a SerpApi key:

```dotenv
SERPAPI_KEY=your-serpapi-key
SERPAPI_URL=https://serpapi.com/search.json
```

Without this key, local job discovery still works through manually pasted descriptions and the browser extension. The server does not fetch arbitrary job URLs, which avoids SSRF and uncontrolled website scraping.

RoleWise calls SerpApi from the backend using the `google_jobs` engine. The user query is combined with verified profile skills, and the saved profile location is sent as the provider location when available. General `engine=google` searches and local-business results are not used as job listings.

Never paste a provider key into source code, the browser console, the extension, screenshots, GitHub, or chat. If a key is exposed, revoke it in the provider dashboard and create a replacement before continuing.

### 5. Apply database migrations

```powershell
npm run db:migrate
```

This applies all SQL files in `apps/api/migrations/`, including the structured education migration.

Run this command again after pulling a change that adds a new migration.

### 6. Start the web app and API

```powershell
npm run dev
```

The root development command starts both workspaces:

| Service | URL |
| --- | --- |
| Web app | http://localhost:5173 |
| API | http://localhost:4000 |
| API liveness | http://localhost:4000/api/health |
| API readiness | http://localhost:4000/api/ready |

Open the web application at:

```text
http://localhost:5173
```

The Vite development server proxies `/api` requests to the API on port `4000`.

## End-to-end local workflow

1. Create or update your career profile at **Career profile**.
2. Upload resume versions at **Resumes** and review extracted suggestions.
3. Open **Recommended jobs**.
4. Search external jobs if `SERPAPI_KEY` is configured, or capture a job with the browser extension.
5. Review the external title, company, description, and URL.
6. Explicitly save the job to your workspace.
7. Open the saved job and run **Analyze job**.
8. Review required skills, preferred skills, verified matches, and gaps.
9. Click **Track application**.
10. Select a resume version, stage, application date, follow-up date, and notes.
11. Update the application stage as the process progresses.
12. Open the application detail page for history and interview preparation.
13. Use the extension on the employer page to capture visible fields.
14. Edit and select proposed values, then confirm autofill.
15. Review the employer page and submit manually.

If you submit from the employer page, return to the extension and click **I submitted this application**. This explicitly records the application as `Applied` in RoleWise. Autofill alone never changes the application to Applied.

Application tracking is a workspace record; it does not submit anything to an employer.

## Quick start with Docker Compose

Docker Compose starts PostgreSQL and the production application together. Docker Desktop must be running.

### 1. Create the Docker environment file

Create `.env` in the repository root:

```dotenv
POSTGRES_PASSWORD=replace-with-a-random-password
JWT_SECRET=replace-with-another-random-secret-of-at-least-32-characters
WEB_ORIGINS=http://localhost:4000
EXTENSION_ORIGINS=
TRUST_PROXY=false
APP_PORT=4000
SERPAPI_KEY=
SERPAPI_URL=https://serpapi.com/search.json
```

Use letters and numbers for `POSTGRES_PASSWORD` to avoid connection-URL escaping problems.

### 2. Validate and start the stack

```powershell
docker compose config --quiet
docker compose up --build -d
```

Open:

```text
http://localhost:4000
```

Check service status and database readiness:

```powershell
curl.exe --fail http://127.0.0.1:4000/api/ready
```

View application logs:

```powershell
docker compose logs -f app
```

Stop the stack:

```powershell
docker compose down
```

Do not run `docker compose down -v` unless you intentionally want to delete the PostgreSQL volume and all local database data.

## Installing the Edge or Chrome extension

### 1. Build the extension

From the repository root:

```powershell
npm run build
```

The unpacked extension is generated at:

```text
apps/extension/dist
```

That folder must directly contain:

```text
manifest.json
```

You can verify it in PowerShell:

```powershell
Test-Path .\apps\extension\dist\manifest.json
```

The result should be:

```text
True
```

### 2. Load the unpacked extension in Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select the folder:

   ```text
   apps\extension\dist
   ```

5. Select the `dist` folder itself. Do not select a JavaScript file.
6. Confirm that the selected folder contains `manifest.json`.

For Chrome, use `chrome://extensions` instead.

### 3. Copy the extension ID

After installing the unpacked extension, copy the ID shown on the extensions page. It will look similar to:

```text
pdlilicjdlfacnmgplcdcjnfodkhcahh
```

### 4. Allowlist the extension origin

Update the root `.env` file:

```dotenv
EXTENSION_ORIGINS=chrome-extension://YOUR_EXTENSION_ID
```

Even when using Microsoft Edge, the extension origin uses `chrome-extension://`.

Example:

```dotenv
EXTENSION_ORIGINS=chrome-extension://pdlilicjdlfacnmgplcdcjnfodkhcahh
```

Restart the API after changing `.env`:

```powershell
npm run dev
```

If you are using Docker, restart the container:

```powershell
docker compose up --build -d
```

### 5. Configure the extension API URL

Open the extension settings and set the API base URL to:

```text
http://localhost:4000/api
```

Log in using the same account as the web application.

### 6. Use reviewed autofill

1. Open a supported application form.
2. Open RoleWise.
3. Capture the visible page.
4. Review detected fields and proposed values.
5. Select the fields to fill.
6. Confirm the fill action.
7. Review the website yourself and submit manually if you choose.

The extension does not click Submit, bypass CAPTCHA, bypass anti-bot controls, or apply to jobs automatically.

## Resume parsing workflow

1. Start the web app.
2. Open the profile or resume area.
3. Upload a PDF or UTF-8 TXT resume.
4. Review the extracted text.
5. Review suggested contact details.
6. Edit and save profile details if they are accurate.
7. Review each suggested education or career entry.
8. Edit the fields, including qualification, board, percentage, CGPA, dates, or institution.
9. Save only the facts you can verify.

Resume extraction never silently overwrites the authoritative profile. Suggestions remain untrusted until you explicitly save them.

## Common commands

Run type checking:

```powershell
npm run typecheck
```

Run all workspace tests:

```powershell
npm test
```

Run the production build:

```powershell
npm run build
```

Run Playwright end-to-end tests:

```powershell
npm run test:e2e
```

Start only the API:

```powershell
npm run dev -w @career/api
```

Start only the web app:

```powershell
npm run dev -w @career/web
```

Build only the extension:

```powershell
npm run build -w @career/extension
```

Package an already-built extension:

```powershell
node scripts/package-extension.mjs
```

## GitHub: prepare and push the repository

Before pushing, check that secrets and generated files are ignored:

```powershell
git status
```

The repository ignores `.env`, `node_modules`, build output, local PostgreSQL data, logs, and test reports.

Do not commit:

- `.env` files.
- PostgreSQL passwords.
- JWT secrets.
- AI provider API keys.
- Access tokens or refresh tokens.
- Uploaded private resumes.

### Create a GitHub repository

1. Sign in to GitHub.
2. Click **New repository**.
3. Choose a repository name, for example `career-copilot`.
4. Keep the new repository empty; do not add another README if this project already has one.
5. Copy the repository URL.

### Commit and push

From the repository root:

```powershell
git init
git branch -M main
git add .
git status
git commit -m "feat: build RoleWise workspace"
git remote add origin https://github.com/YOUR_USERNAME/career-copilot.git
git push -u origin main
```

Replace `YOUR_USERNAME` and the repository name with your own values.

For later changes:

```powershell
git status
git add .
git commit -m "describe the change"
git push
```

## Troubleshooting

### PostgreSQL connection refused

Make sure PostgreSQL is running. On Windows, open **Services** and start the PostgreSQL service, usually named something like:

```text
postgresql-x64-17
```

Then verify that `.env` contains the correct `DATABASE_URL`.

### Password authentication failed

Reset the database user password as a PostgreSQL administrator:

```sql
ALTER USER career WITH PASSWORD 'career-password';
```

Make sure the same password is present in `DATABASE_URL`.

### Database does not exist

Run:

```sql
CREATE DATABASE career OWNER career;
```

Then run:

```powershell
npm run db:migrate
```

### `manifest.json` is missing from the extension folder

Build the extension again:

```powershell
npm run build -w @career/extension
```

Then load:

```text
apps\extension\dist
```

### Extension API requests are blocked

Check all of the following:

- The API is running on port `4000`.
- The extension API base is `http://localhost:4000/api`.
- `EXTENSION_ORIGINS` contains the exact installed extension ID.
- The API was restarted after changing `.env`.
- The extension is not using an old unpacked build. Rebuild and click **Reload** on the extensions page.

### Migration errors after upgrading

Back up the database before making schema changes. Then run:

```powershell
npm run db:migrate
```

Do not delete or manually edit the `schema_migrations` table in a database that contains user data.

### Port already in use

The default ports are:

- Web: `5173`
- API: `4000`
- PostgreSQL: `5432`

Stop the process using the port or update the corresponding configuration before starting the application.

## Security notes

- Passwords are hashed and are never stored in plaintext.
- Private resources are scoped to the authenticated user.
- Refresh tokens are stored securely according to client type.
- Resume files and extracted text are private user data.
- Do not log credentials, tokens, passwords, or uploaded resume content.
- Do not use wildcard extension origins.
- Production web origins must use HTTPS.
- The extension requires explicit user confirmation before autofill.
- Applications are never submitted automatically.

## Documentation

Additional documentation is available under `docs/`:

- `docs/deployment.md` — Docker and deployment notes.
- `docs/testing.md` — test and verification details.
- `docs/contract.md` — API and shared contract.

## License

Add the project license here before publishing a public release.
