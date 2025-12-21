# Getting Started with ODK Central Development

This guide walks you through setting up the ODK Central development environment (backend + frontend).

## VG fork customization docs

This repo includes VG-specific customizations for app user authentication and settings. For details, see:

- [`client/docs/vg_client_changes.md`](client/docs/vg_client_changes.md)
- [`client/docs/vg_core_client_edits.md`](client/docs/vg_core_client_edits.md)
- [`client/docs/vg-component-short-token-app-users.md`](client/docs/vg-component-short-token-app-users.md)
- [`server/docs/vg_api.md`](server/docs/vg_api.md)
- [`server/docs/vg_core_server_edits.md`](server/docs/vg_core_server_edits.md)
- [`server/docs/vg_tests.md`](server/docs/vg_tests.md)

## Prerequisites

- Docker and Docker Compose installed
- Git installed

---

## Step 1: Clone and Initialize Submodules

```bash
cd central

# Sync submodule config
git submodule sync --recursive

# Initialize and pull submodules
git submodule update --init --recursive

# Verify submodules
git submodule status
```

---

## Step 2: Environment Configuration

```bash
# Copy environment template
cp .env.template .env
```

Edit `.env` with these values:
```
DOMAIN=central.local
SYSADMIN_EMAIL=you@example.com
SSL_TYPE=selfsign
# Optional: extra host/IP that should match TLS and nginx (e.g., Android emulator loopback)
# EXTRA_SERVER_NAME=10.0.2.2
#
# If you leave EXTRA_SERVER_NAME unset, nginx now treats it as optional (no build errors).
```

---

## Step 3: Configure /etc/hosts (or local DNS)

Add `central.local` to your hosts file:

```bash
sudo nano /etc/hosts
```

Add this line:
```
127.0.0.1 central.local
```

---

## Step 4: Build and Start Backend Services

```bash
cd central

# Build all services
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central build postgres14 enketo_redis_main enketo_redis_cache pyxform enketo mail secrets service

# Start services
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central up -d

# Install npm dependencies
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central run --rm service npm install

# Apply database migrations
docker exec -i central-postgres14-1 psql -U odk -d odk < server/plan/sql/vg_app_user_auth.sql

# Start service and nginx
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central up -d service nginx

```

**Backend is now running at:** `https://central.local`

---

## Step 5: Create Admin User

```bash
cd central

# Create user
docker compose --env-file .env exec service odk-cmd --email your@email.com user-create

# Promote to admin
docker compose exec service odk-cmd --email your@email.com user-promote

# Reset password
docker compose exec service odk-cmd --email your@email.com user-set-password

```

---

## Step 6: Start Frontend Development (HMR via https://central.local)

```bash
cd central
docker compose up -d client-dev
```

Then open `https://central.local` (accept the self-signed cert). Nginx proxies the frontend to the Vite dev server so HMR and API share one origin.

Diagram:
```
Browser https://central.local
        |
        v
   nginx (443)
    |            \
    | (UI, HMR)    \( API: /v1..., /- to Enketo)
client-dev:8989    service:8383 -> enketo:8005
```

---

## Quick Reference

| Service | URL |
|---------|-----|
| Backend | `https://central.local` |
| Frontend Dev (HMR proxied) | `https://central.local` |

---

## Production-ish Setup (built frontend, no HMR)

```bash
cd central
# Build images and start everything (frontend is built into nginx image)
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central up -d
```

- Use a real hostname in `.env` (`DOMAIN=mydomain.org`) and set `SSL_TYPE` to `letsencrypt` for real certs, or `selfsign` for local.
- Access at `https://<DOMAIN>`; no client-dev container needed in this mode.

## How proxying and hostnames work
- **UI (dev/HMR)**: `https://central.local` → nginx → `client-dev:8989` (Vite). Websocket upgrade is enabled for HMR.
- **API**: `https://central.local/v1/...` → nginx → `service:8383` (Express backend).
- **Enketo**: `https://central.local/-/...` → nginx → `enketo:8005` (or Web Forms redirect).
- **Change the hostname**: set `DOMAIN` in `.env` (affects nginx and backend config) and update `/etc/hosts`. For dev HMR, also ensure the host is allowed in `client/vite.config.js` (`allowedHosts`).
- **Nginx configs**: [`files/nginx/odk.conf.template`](files/nginx/odk.conf.template) (main proxy served by `nginx` container), [`client/main.nginx.conf`](client/main.nginx.conf) (dev proxy inside `client-dev`).

### Android emulator access (10.0.2.2)
- The Android emulator reaches the host via `10.0.2.2`. Set `EXTRA_SERVER_NAME=10.0.2.2` in `.env` so nginx accepts that Host/SNI instead of returning 421.
- Regenerate your local TLS cert with a SAN for both `central.local` and `10.0.2.2` (for example, `mkcert central.local 10.0.2.2`) and point `ssl_certificate`/`ssl_certificate_key` accordingly (handled automatically by the template when you rebuild/restart nginx).
- Use `https://10.0.2.2` inside the emulator; your desktop browser can continue using `https://central.local`.

## Secrets (Enketo and others)
- The `secrets` container writes secrets to `/etc/secrets` (e.g., `enketo-api-key`).
- `service` uses those secrets when rendering `server/config/local.json` at container start.
- `enketo` also mounts `/etc/secrets` and uses the same key.
- If you change secrets, restart the dependent containers: `docker compose restart service enketo nginx`.
- Enketo keys live at `/etc/secrets/enketo-secret`, `/etc/secrets/enketo-less-secret`, and `/etc/secrets/enketo-api-key` (generated by `files/enketo/generate-secrets.sh`). Service reads `enketo-api-key` into its config; Enketo reads all three. To rotate, update the files in the secrets volume (or adjust `generate-secrets.sh`), then restart `service`, `enketo`, and `nginx`.
- `server/config/local.json` may contain a dev Enketo API key for convenience, but the running container still sources the key from `/etc/secrets/enketo-api-key`. In production, rely on the secrets volume, not the checked-in file.

## GIT Submodule Workflow

This project uses two git submodules:

| Submodule | Path | Repository |
|-----------|------|------------|
| Backend | `server/` | `drguptavivek/central-backend.git` |
| Frontend | `client/` | `drguptavivek/central-frontend.git` |

### Understanding Submodules

- The main `central` repo only tracks **pointers** (SHA commits) to submodules, not the actual code
- Changes inside `server/` or `client/` must be committed **inside** those directories first
- Then update the pointer in the parent `central` repo

### Initial Setup (After Clone)

```bash
cd central

# Sync submodule URLs from .gitmodules
git submodule sync --recursive

# Initialize and fetch submodule content
git submodule update --init --recursive

# Verify submodules are correctly configured
git submodule status
git config --get-regexp '^submodule\..*\.url$'
```

### Daily Workflow: Pull Latest Changes

```bash
cd central

# Pull main repo changes
git pull

# Update submodules to match the pointers in central
git submodule update --recursive
```

### Making Backend Changes (server/)

```bash
# 1. Navigate to server submodule
cd central/server

# 2. Ensure you're on the correct branch
git checkout master
git pull origin master

# 3. Make your changes, then commit
git add .
git commit -m "feat: your backend change"

# 4. Push to backend repo
git push origin master

# 5. Update pointer in central repo
cd ..
git add server
git commit -m "Update server submodule"
git push
```

### Making Frontend Changes (client/)

```bash
# 1. Navigate to client submodule
cd central/client

# 2. Ensure you're on the correct branch
git checkout master
git pull origin master

# 3. Make your changes, then commit
git add .
git commit -m "feat: your frontend change"

# 4. Push to frontend repo
git push origin master

# 5. Update pointer in central repo
cd ..
git add client
git commit -m "Update client submodule"
git push
```

### Making Changes to Both Submodules

```bash
# 1. Commit and push backend changes
cd central/server
git add . && git commit -m "feat: backend change"
git push origin master

# 2. Commit and push frontend changes
cd ../client
git add . && git commit -m "feat: frontend change"
git push origin master

# 3. Update both pointers in central
cd ..
git add server client
git commit -m "Update server and client submodules"
git push
```

### Best Practices

1. **Always commit inside submodules first** - Never commit only in `central` if you have submodule changes
2. **Push submodule changes before updating pointers** - Otherwise collaborators can't fetch your changes
3. **Check for dirty submodules** before committing:
   ```bash
   git status
   # Look for "modified: server (modified content)" or similar
   ```
4. **Use `git diff --submodule`** to see what changed in submodules
5. **After pulling central**, always run:
   ```bash
   git submodule update --recursive
   ```

### Troubleshooting

**Submodule shows as "dirty" but no changes?**
```bash
cd server  # or client
git status
git checkout .  # discard unintended changes
```

**Submodule pointing to wrong commit?**
```bash
git submodule update --init --recursive
```

**Want to see which commits submodules point to?**
```bash
git submodule status
```


## Running Tests

### Setup Test Database (one-time)

Before running integration tests, create the test database:

```bash
# Create test user
docker exec -e PGPASSWORD=odk central-postgres14-1 psql -U odk -c "CREATE ROLE odk_test_user LOGIN PASSWORD 'odk_test_pw'"

# Create test database
docker exec -e PGPASSWORD=odk central-postgres14-1 psql -U odk -c "CREATE DATABASE odk_integration_test OWNER odk_test_user"

# Apply migrations to test database
docker exec -i central-postgres14-1 psql -U odk -d odk_integration_test < server/plan/sql/vg_app_user_auth.sql
```

### Backend Unit Tests

```bash
# Run a specific unit test
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/unit/util/vg-password.js'
```

### Backend Integration Tests

```bash
# Run a specific integration test file
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api/vg-app-user-auth.js'

# Run all integration tests (minimal output)
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api --reporter min'

# Run all integration tests (dot reporter)
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api --reporter dot'

# Run all integration tests (default reporter - verbose)
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api'
```

### Frontend Tests

```bash
cd central/client

# Run all tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## Useful Commands

### View Logs

```bash
# Follow service logs
docker compose logs service -f

# Follow all logs
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central logs -f

# View specific service logs
docker compose logs nginx -f
docker compose logs postgres14 -f
```

### Restart Services

```bash
# Restart backend service (after code changes if nodemon doesn't pick up)
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central restart service

# Restart frontend dev server
docker compose restart client-dev
```

### Stop All Services

```bash
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central down
```

### Access Database

```bash
# Connect to PostgreSQL
docker exec -it central-postgres14-1 psql -U odk -d odk
```

---


## BACKEND TESTS


```bash

# VG password unit test
docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk &&  NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/unit/util/vg-password.js'


# VG integration tests
docker exec -e PGPASSWORD=odk central-postgres14-1 psql -U odk -c "CREATE ROLE odk_test_user LOGIN PASSWORD 'odk_test_pw'"

docker exec -e PGPASSWORD=odk central-postgres14-1 psql -U odk -c "CREATE DATABASE odk_integration_test OWNER odk_test_user"

docker exec -i central-postgres14-1 psql -U odk -d odk_integration_test < server/plan/sql/vg_app_user_auth.sql

docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk  && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha --recursive test/integration/api/vg-app-user-auth.js'

docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk  && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api/vg-tests-orgAppUsers.js'



 docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk  && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api'


 docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk  && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api --reporter dot'

  docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central exec service sh -lc 'cd /usr/odk  && NODE_CONFIG_ENV=test BCRYPT=insecure npx mocha test/integration/api --reporter min'
```
