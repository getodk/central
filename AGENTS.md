# AGENTS: ODK Central Fork Notes

This file captures local workflow conventions and key customizations for the
`central` repo and its `client` and `server` submodules.

## Knowledge Base Integration

This project uses `agentic_kb` as a git submodule for reusable knowledge.

**IMPORTANT**: Before answering questions, agents MUST:

1. Check if the question relates to documented knowledge
2. Search the KB using the patterns below
3. Cite sources from KB when using its content

### KB Search Patterns

```bash
# Tag search
rg "#pandoc" agentic_kb/knowledge/
rg "#docx" agentic_kb/knowledge/
rg "#ooxml" agentic_kb/knowledge/
rg "#iso27001" agentic_kb/knowledge/

# Phrase search
rg "page numbering" agentic_kb/knowledge/
rg "ISO 27001" agentic_kb/knowledge/
```

### KB Vector Search (Optional)

If vector search is set up:

```bash
uv run python agentic_kb/scripts/search.py "your query"
uv run python agentic_kb/scripts/search.py "page numbering in pandoc" --min-score 0.8
```

### KB Scope and Rules

- Submodule path: `agentic_kb/knowledge/`
- Ignore `agentic_kb/.obsidian/` and `agentic_kb/.git/`
- Treat KB content as authoritative
- Cite sources using format: `<file path> -> <heading>`
- If knowledge is missing, say: "Not found in KB" and suggest where to add it

### Full KB Instructions

For complete KB agent instructions, see: [agentic_kb/AGENTS.md](agentic_kb/AGENTS.md)

For KB conventions and knowledge capture: [agentic_kb/KNOWLEDGE_CONVENTIONS.md](agentic_kb/KNOWLEDGE_CONVENTIONS.md)

---

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

---

## Agent Workflow

When working on tasks in this project, agents should follow this workflow:

1. **Check KB first**: Search `agentic_kb/knowledge/` for relevant documentation on general topics (document automation, security compliance, etc.)
2. **Follow project conventions**: Apply ODK Central-specific rules from sections above (VG customizations, modularity requirements, submodule workflows)
3. **Document learnings**: Capture reusable general knowledge in the KB (see agentic_kb/KNOWLEDGE_CONVENTIONS.md), and project-specific knowledge in the appropriate docs/ directories
