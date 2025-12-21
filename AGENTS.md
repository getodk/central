# AGENTS: ODK Central Fork Notes

This file captures local workflow conventions and key customizations for the
`central` repo and its `client` and `server` submodules.

## Repos and Branch Policy

- Work only on `vg-work` in all three repos:
  - `central` (this repo)
  - `client` submodule (`drguptavivek/central-frontend`)
  - `server` submodule (`drguptavivek/central-backend`)
- Upstream for client is `https://github.com/getodk/central-frontend`.
- Upstream for central is `https://github.com/getodk/central`.
- Rebase `vg-work` onto upstream `master` every few months.

## Submodules

- `client/` and `server/` are the only submodules in use.

## Workflow (Short)

1) Work and commit inside `client` or `server` first.
2) Push submodule changes.
3) Update submodule pointers in `central` and commit.

## Customizations Summary

## EXTREMELY IMPORTANT: Preserve Modularity for Rebasing

- Keep VG customizations isolated and modular to minimize conflicts when
  rebasing onto upstream `master`.
- Prefer new `vg-*` components, routes, and helper files over modifying core
  upstream files unless strictly necessary.
- When modifying upstream files, keep changes small and well-scoped.
- Any core file edits must be documented in:
  - `client/docs/vg_core_client_edits.md`
  - `server/docs/vg_core_server_edits.md`

### Client (central-frontend fork)

- App User auth UI overhaul:
  - Username/password login with short-lived sessions.
  - Secure QR codes (no credentials embedded).
  - New fields: username, phone.
  - New flows: reset password (auto-generate), edit app user, restore access.
- System Settings UI:
  - New tab `/system/settings` for session TTL + session cap.
- Dev environment:
  - Dockerized Vite dev container (`Dockerfile.dev`).
  - Dev proxy defaults to `https://central.local`.
  - Vite allowedHosts includes `central.local`.
- E2E test defaults:
  - Default domain `central.local`.
  - Simplified response checks.

See `client/docs/vg_client_changes.md` for the full diff and detailed list.

### Namespacing / Prefixing Conventions

- UI components and views are prefixed with `vg-`.
- Routes/loaders reference VG-specific components (for example `VgSettings`).
- Backend tables and settings are `vg_*`-prefixed:
  - `vg_field_key_auth`, `vg_settings`, `vg_app_user_login_attempts`.
- Settings keys:
  - `vg_app_user_session_ttl_days`
  - `vg_app_user_session_cap`
- Audit/action identifiers for these features use `vg`-prefixed names.

### Server (central-backend fork)

- Implements App User auth endpoints and short-lived sessions.
- Adds app user settings (TTL + session cap) storage and APIs.
- Adds login attempt tracking and user activation/revocation logic.

Key API behaviors (see `server/docs/vg_api.md`):

- No long-lived tokens in list/create responses; `/login` returns a short-lived
  bearer token.
- App-user auth is bearer-only (no cookies).
- Session TTL and cap enforced via `vg_settings`.
- Failed login attempts are rate-limited (5 failures/5 minutes => 10-min lock).
- Endpoints added:
  - `/projects/:projectId/app-users/login`
  - `/projects/:projectId/app-users/:id/password/reset`
  - `/projects/:projectId/app-users/:id/password/change`
  - `/projects/:projectId/app-users/:id/revoke`
  - `/projects/:projectId/app-users/:id/revoke-admin`
  - `/projects/:projectId/app-users/:id/active`

Password policy (server):
- Minimum 10 characters.
- At least one uppercase, one lowercase, one digit, one special.

See server-side documentation in the server repo for details.

### Central (meta repo)

- Tracks `client` and `server` submodule pointers on `vg-work`.
