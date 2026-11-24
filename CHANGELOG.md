# Operations Infrastructure Changelog

This changelog lists changes to operations infrastructure, i.e., code changes to this repository. There are also changelogs for `central-backend` and `central-frontend`, corresponding to changes in those repositories:

<details>
<summary>Other changelogs</summary>

* [`central-backend`](https://docs.getodk.org/central-api-changelog/)
* `central-frontend`
  * [apps/central](https://github.com/getodk/central-frontend/tree/master/apps/central/CHANGELOG.md)
  * [apps/forms](https://github.com/getodk/central-frontend/tree/master/apps/forms/CHANGELOG.md)
  * [packages/web-forms](https://github.com/getodk/central-frontend/blob/master/packages/web-forms/CHANGELOG.md)
  * [packages/xforms-engine](https://github.com/getodk/central-frontend/blob/master/packages/xforms-engine/CHANGELOG.md)
  * [packages/xpath](https://github.com/getodk/central-frontend/tree/master/packages/xpath/CHANGELOG.md)
</details>

## 2026.4.0

- Upgrade PostgreSQL version to v18 (getodk/central#2285)
- Don't attempt to upload blobs to S3 if not configured (getodk/central#1476)
- Fix support for multiline values in postgres-related environment variables (getodk/central#2203)
- Reduce `central-backend` worker count for some systems with &lt;1GB RAM (getodk/central#2306)
- Rename `secrets.dockerfile` -> `enketo-secrets.dockerfile` (getodk/central#2303)
- Rename `files/enketo/generate-secrets.sh` -> `files/enketo-secrets/generate-secrets.sh` (getodk/central#2303)
- Allow embedding of public-access forms in iframes (getodk/central#2321)
- Update postgresql-client in the `service` container from v14 to v18 (getodk/central#2317)
- Add optional `GOOGLE_MAPS_KEY` to show Google Maps layers in Web Forms map questions (getodk/web-forms#517)
- Update infrastructure dependencies (postgres to 18.7, node to 26.13.1, smtp to 2.0.14)

## 2026.3.2

- Update postgres dependency from 14.24 to 14.25
- Update nginx dependency from 1.31.5 to 1.31.9

## 2026.3.0

- Show error message for incorrect encryption password (getodk/central#2080)
- Buffer slow client reads in nginx (getodk/central#2029)
- Update infrastructure dependencies (getodk/central#2120)
- Fix Google Map tiles in Enketo (getodk/central#2071)
- Fix OSM tiles in Enketo in Firefox (getodk/central#1885)
