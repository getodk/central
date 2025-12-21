# VG Fork: Short-Lived Token App Users

This document describes the technical implementation of the "VG App User Auth" system, which introduces username/password authentication and short-lived session tokens for App Users (Field Keys), replacing the legacy long-lived token model.

## 1. Overview

Legacy ODK Central App Users rely on a long-lived API token (valid for 10+ years) embedded in the QR code. This poses a security risk if the QR code is compromised.

The VG implementation introduces:
-   **Username/Password Authentication**: App Users must log in to obtain a session token.
-   **Short-Lived Tokens**: Session tokens have a configurable expiration (default 3 days).
-   **Enhanced Management**: Support for phone numbers, password resets, and explicit revocation/restoration.

## 2. Database Schema

The system extends the `field_keys` and `actors` tables using sidecar tables.

### `vg_field_key_auth`
Stores authentication credentials and status for App Users.
```sql
CREATE TABLE vg_field_key_auth (
  "actorId" integer PRIMARY KEY REFERENCES actors(id),
  vg_username text NOT NULL UNIQUE,
  vg_password_hash text NOT NULL,
  vg_phone text,
  vg_active boolean DEFAULT true
);
```

### `vg_settings`
Stores system-wide configuration for App User sessions.
```sql
CREATE TABLE vg_settings (
  vg_key_name text PRIMARY KEY,
  vg_key_value text
);
```
**Default Values**:
- `vg_app_user_session_ttl_days`: "3"
- `vg_app_user_session_cap`: "2"

### `vg_app_user_login_attempts`
Tracks login attempts for rate limiting and security auditing.
```sql
CREATE TABLE vg_app_user_login_attempts (
  id serial PRIMARY KEY,
  username text NOT NULL,
  ip text NOT NULL,
  succeeded boolean NOT NULL,
  "createdAt" timestamptz DEFAULT now()
);
```

## 3. Backend Implementation

### Resources (`server/lib/resources/vg-app-user-auth.js`)
The following endpoints handle App User authentication and management:

| Method | Path | Description | Access |
| :--- | :--- | :--- | :--- |
| `POST` | `/v1/projects/:id/app-users/login` | Authenticate and get session token (returns `id`, `token`, `projectId`, `expiresAt`). | Anonymous |
| `POST` | `/v1/projects/:id/app-users/:id/password/change` | Change own password. | Self |
| `POST` | `/v1/projects/:id/app-users/:id/password/reset` | Reset user password. | Admin |
| `POST` | `/v1/projects/:id/app-users/:id/revoke` | Revoke own sessions. | Self |
| `POST` | `/v1/projects/:id/app-users/:id/revoke-admin` | Revoke user access (deactivate). | Admin |
| `POST` | `/v1/projects/:id/app-users/:id/active` | Restore or deactivate user. | Admin |
| `GET` | `/v1/system/settings` | Get session configuration. | Admin |
| `PUT` | `/v1/system/settings` | Update session configuration. | Admin |

### Domain Logic (`server/lib/domain/vg-app-user-auth.js`)
-   **Login**: Verifies password hash, checks `vg_active` status, and creates a session using standard `Sessions.create`.
-   **Revocation**: Sets `vg_active = false` and deletes all active sessions for the user.
-   **Restoration**: Sets `vg_active = true`.
-   **Password Reset**: Updates `vg_password_hash` and terminates existing sessions.

### Queries (`server/lib/model/query/vg-app-user-auth.js`)
-   **`getSessionTtlDays`**: Fetches TTL from `vg_settings` (default 3).
-   **`getSessionCap`**: Fetches session cap from `vg_settings` (default 2).
-   **`upsertSetting`**: Inserts or updates configuration keys.

## 4. Frontend Implementation

### Routes (`client/src/routes.js`)
-   `/system/settings`: Maps to `VgSettings` component. Requires `config.read` and `config.set` permissions.

### Components

#### `client/src/components/system/vg-settings.vue`
-   **Purpose**: Admin interface for configuring session settings.
-   **Features**:
    -   Fetches current TTL and Cap settings.
    -   Validates inputs (min 1).
    -   Updates settings via `PUT /v1/system/settings`.
    -   Displays success/error alerts.

#### `client/src/components/user/vg-list.vue`
-   **Purpose**: Enhanced list view for App Users.
-   **Features**:
    -   Columns: Display Name, Username, Phone, Created Date.
    -   Actions: Revoke Access, Restore Access, Reset Password.

#### `client/src/components/user/vg-new.vue`
-   **Purpose**: Modal for creating new App Users.
-   **Features**:
    -   Auto-generates strong passwords.
    -   Validates phone number format `(+xx) xxxxxxxxxx`.
    -   Displays credentials for manual recording.

#### `client/src/components/user/vg-qr-panel.vue`
-   **Purpose**: Displays connection information.
-   **Features**:
    -   **QR Code**: Contains only Server URL and Project Name (no credentials).
    -   **Credentials**: Displays Username and Password in plaintext for manual entry.

### Resources (`client/src/request-data/resources.js`)
-   **`systemSettings`**: App-wide resource for fetching/updating session config.

## 5. Security Enhancements

### Secure QR Code
The configuration QR code **no longer contains credentials**.
-   **Legacy**: Encoded full credentials (token or username/password).
-   **New**: Encodes only Server URL and Project Name.
-   **Flow**: User scans QR -> ODK Collect prompts for Username/Password -> User enters credentials manually.

### Password Policy
-   **Requirements**: At least 1 uppercase, 1 lowercase, 1 digit, 1 symbol.
-   **Generator**: Auto-generates strong passwords (format: `Word-Word-123-Word`) during creation and reset.
