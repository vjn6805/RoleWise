# Deployment
ile: C:\Users\Veer Jain\.omnirush\agent\sessions\--C--Users-Veer Jain-Desktop-Codes-Web Development-Extension                                             
 JOB--\2026-09-30T08-10-15-296Z_01a0f15d-3f7f-7262-8010-dcc3349c7806.jsonl                                                                                  
 ID: 01a0f15d-3f7f-7262-8010-dcc3349c7806               
## Prerequisites and local development

Use Node.js 22.16+ and PostgreSQL 17+ (PostgreSQL is required; there is no in-memory production fallback). From the repository root:

```sh
npm ci
# Create a database and configure .env using .env.example.
npm run db:migrate
npm run dev
```

The web development server is `http://localhost:5173`; Vite proxies `/api` to port 4000. The API listens at `http://localhost:4000` by default. Do not put JWT secrets, database passwords, or AI credentials in `VITE_*` variables or extension bundles.

Required API environment: `DATABASE_URL` (PostgreSQL URL), `JWT_SECRET` (at least 32 random characters). `WEB_ORIGINS` is a comma-separated list of exact origins, with no trailing slash. `EXTENSION_ORIGINS` separately allowlists exact `chrome-extension://<id>` origins. The public web origin must use HTTPS when `NODE_ENV=production`. `TRUST_PROXY=true` is appropriate only behind your controlled reverse proxy, with direct API ingress blocked.

The deterministic evidence-based provider needs **no external AI account or credentials**. Leave `AI_BASE_URL` and `AI_API_KEY` unset, not empty strings. Optional provider setup is covered by [AI safety](ai-safety.md).

## Production image and Compose

The multistage `Dockerfile` builds all workspaces, packages the extension, prunes development dependencies, and runs as the unprivileged `node` user. The API serves the built SPA from `apps/web/dist` and its `/downloads` folder. The container runs the workspace migration command before starting the API, and refuses to start if migration fails. The API workspace currently starts via its production `tsx` dependency; compiled output is built and checked too.

Create a deployment-only `.env` (never commit it):

```dotenv
# Generate independent values with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
POSTGRES_PASSWORD=replace-with-random-hex
JWT_SECRET=replace-with-another-random-hex
WEB_ORIGINS=https://careers.example.com
# Set after installing your unpacked package or publishing a store release.
EXTENSION_ORIGINS=
TRUST_PROXY=true
APP_PORT=4000
```

Use a hexadecimal database password here: Compose embeds it in a connection URL, so arbitrary reserved URL characters would require encoding. Empty `EXTENSION_ORIGINS` means extension access is not configured; web access still works.

```sh
docker compose config --quiet
docker compose up --build -d
docker compose ps
docker compose logs --tail=100 app
curl --fail http://127.0.0.1:4000/api/ready
```

Compose does **not** provision DNS, TLS certificates, a reverse proxy, cloud networking, backups, or a browser-store listing. Configure an HTTPS reverse proxy such as Caddy/nginx from your public domain to `127.0.0.1:4000`, preserve `Host`, and set forwarded protocol/address headers. The application port is intentionally bound to host loopback; PostgreSQL has no published host port. Direct HTTP production login is not a supported deployment: refresh cookies require secure transport.

Database startup is health-gated. `/api/health` is liveness, `/api/ready` checks database readiness. Health checks do not replace monitoring/error alerting. This Compose setup is a single-host baseline, not a highly available production platform. For multiple replicas, perform migrations in one deployment job before rolling out replicas; review migration concurrency in [database documentation](database.md).

## Data durability and operations

- PostgreSQL data lives in the named `postgres_data` volume. Never use `docker compose down -v` on data you want to retain.
- Resume storage is part of the API's PostgreSQL persistence; review [database documentation](database.md) before configuring backup/retention.
- Back up before upgrades and test restoration into a separate database. Example: `docker compose exec -T db pg_dump -U career -d career -Fc > career.dump`. Store backups encrypted and restrict access: they contain private career data and uploaded resumes.
- Keep secrets in your platform's secret manager in a real deployment. Environment values are visible to administrators with container inspection access.
- Pin reviewed base-image digests for a release, update dependencies, and scan the image. The provided tags track their respective major versions; they are not immutable supply-chain pins.
- Check proxy upload/body-size limits against the API's 5 MiB resume limit. Do not log access/refresh tokens or uploaded content.
- Rollback means redeploying a known image compatible with the current schema, or restoring a tested backup. There is no automatic destructive down-migration command.

## Extension download and installation

```sh
npm run build
# Or after the extension is already built:
node scripts/package-extension.mjs
```

Packaging requires `apps/extension/dist/manifest.json` (Manifest V3). It writes the identical `career-copilot-extension.zip` to:

- `apps/web/public/downloads/` for Vite development serving;
- `apps/web/dist/downloads/` for the already-built production SPA.

The URL is `/downloads/career-copilot-extension.zip`. The ZIP contains extension build files at its root and `INSTALL.txt`. A download **does not install an extension**. For this unsigned developer distribution, users must extract it, enable Developer mode at `chrome://extensions` (or `edge://extensions`), choose **Load unpacked**, and select the folder containing `manifest.json`. Keep that folder in place. An eventual store release requires publisher registration, review, and a genuine store listing; no store listing is claimed here.

Unpacked extension IDs can vary by path/machine. Copy the installed ID from the browser extensions page into the API's `EXTENSION_ORIGINS`, restart the API, then configure the extension's API base as `https://careers.example.com/api` and explicitly grant backend access. Do not loosen the API to wildcard extension origins. See [extension documentation](extension.md) for permissions and native side-panel behavior.

## Verification scope

See [testing](testing.md) for exact test commands and verification limits. Docker must be available to validate this image/Compose deployment; file review and browser tests alone are not a successful container deployment.




omnirush -s ses_ee97e65daffedzjpltVYiESYfv