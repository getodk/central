
## VG fork customization docs

This repo includes VG-specific customizations for app user authentication and settings. For details, see:

- `client/docs/vg_client_changes.md`
- `client/docs/vg_core_client_edits.md`
- `client/docs/vg-component-short-token-app-users.md`
- `server/docs/vg_api.md`
- `server/docs/vg_core_server_edits.md`
- `server/docs/vg_tests.md`

## SUBMODULES
   ../central/server is a git submodule
  (from .gitmodules: https://github.com/drguptavivek/
  central-backend.git). 
  
  If you run git commit at the top of ../central, 
  you will only record the submodule pointer change 
  (the SHA of server), not the actual backend file changes. 
  
  The backend files are committed by going inside 
  ../central/server and committing to
  whatever branch is checked out there (likely master
  unless you switched). So:

  - Commit backend changes: cd ../central/server &&
    git status && git commit … (push to drguptavivek/
    central-backend on the current branch).
  - Then, if you want ../central to track that new
    backend commit, cd ../central, git add server, git
    commit … (this updates the submodule SHA recorded
    in the parent repo).

  Committing only in ../central without committing in
  server will not preserve the backend edits—they’ll
  remain as “dirty submodule” changes.
  
```bash
cd central 
# inside central to sync local config; 
git submodule sync --recursive 
# to pull the new remotes.
git submodule update --init --recursive 
git submodule status 
# to verify they point to your forks.
git  config --get-regexp '^submodule\..*\.url$' 
```

## ENV
  
```bash
cd central && cp .env.template .env
```

DOMAIN=central.local
SYSADMIN_EMAIL=you@example.com
SSL_TYPE=selfsign 

(easier locally), and keep the    default ports.


-  Add 127.0.0.1 central.local to /etc/hosts so the domain resolves.
```bash
sudo nano /etc/hosts
```

## DEVELPONG BACNEKD

Added a dev override to bind-mount the backend so code updates reload via nodemon.
```central/docker-compose.override.yml```

 - Mounts ./server into the container (/usr/odk) and keeps node_modules in a named
    volume so your image-installed deps aren’t clobbered.
  - Runs `npx nodemon --watch lib --watch config lib/bin/run-server.js` for live reload.

 
# DOCKER UP 

```bash
cd central

docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central build  postgres14 enketo_redis_main  enketo_redis_cache pyxform enketo mail secrets service


docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central up -d 

docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central run --rm service npm install

# Apply DB migration
docker exec -i central-postgres14-1 psql -U odk -d odk < server/plan/sql/vg_app_user_auth.sql


docker compose -f docker-compose.yml -f docker-compose.override.yml -f docker-compose.dev.yml --profile central up  -d service nginx

```

- Hit https://central.local (or http://central.local if you switch SSL_TYPE to upstream/    customssl).
  
  http://central.local

Edit backend files locally in central/server;  nodemon inside the container will reload on change.

## USER CREATIOn
```bash
cd central

docker compose --env-file .env exec service odk-cmd --email name@example.com user-create
docker compose exec service odk-cmd --email name@example.com  user-promote

```

name@example.com
password2026

## TESTS

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

docker compose logs service -f
