---
name: Patch release
about: Checklist for releasing a patch version of ODK Central
title: 'Patch release vXXXX.X.Y'
type: 'Task'
labels: ''
assignees: ''
---

Complete the steps below to release a patch version of ODK Central. For a major release, use the **Release** issue template instead.

> **Legend**
> - 🔎 Requires the second person (reviewer)

Releasing requires two people: one person to push PRs and complete other tasks and another person to review the PRs.

---

## Steps

- [ ] Decide the release version (`vXXXX.X.Y`). The same version is used for `central`, `central-backend`, and `central-frontend`, so the `central` release URL (`https://github.com/getodk/central/releases/tag/vXXXX.X.Y`) can be referenced from the `central-frontend` and `central-backend` release bodies.
- [ ] List all the issues in `central` and `web-forms` repos to be included in this release, and tick them off when they have been cherry-picked into the release branch
  - [ ] <!-- first issue -->

### Get the repository

- [ ] Get the latest version of the `central` repository locally.
  - If you have **not** cloned the repository: clone it.
  - If you had **already** cloned the repository: `git pull`
- [ ] Check out the correct branch. If the patch involves a single change/PR to the `central` repository, check out the `master` branch. Otherwise, use a hotfix branch off `master` (never `next`, which may contain changes not intended for the patch); check out that branch.

### Release `central-frontend`

> Optional section: skip it if no `central-frontend` changes are included in the patch.

- [ ] Check out the `central-frontend` hotfix branch for the patch (create it from the previous release tag if it doesn't exist), and cherry-pick the commits for the patch from `master` onto it.
- [ ] Run `npm run version` in `central-frontend`, then `npm install`. This consumes the `.changeset/` files, bumps package versions, updates each `CHANGELOG.md`, and updates `package-lock.json`.
- [ ] Commit the changes on a new branch and open a PR targeting the hotfix branch.
- [ ] 🔎 Review the PR. Verify the cherry-picked commits, the version bumps and `CHANGELOG.md` entries match what's expected from the `.changeset/` files, and that `package-lock.json` was updated.
- [ ] Merge the PR into the hotfix branch.
- [ ] In `central-frontend`, create a minimal GitHub release on the merged commit. The tag push is what triggers `.github/workflows/wf-publish.yml` to publish packages to npm — full release notes live only in the `central` release.
  - Tag: `v*.*.*` (no pre-release suffix).
  - Set as the **latest release**. Don't set as a pre-release.
  - Body: a single line pointing to the upcoming `central` release, e.g., `See release notes at https://github.com/getodk/central/releases/tag/vX.Y.Z`.
- [ ] Wait for `wf-publish.yml` to complete, then verify:
  - The Actions run finished green.
  - The expected packages were published to npm.
  - Per-package tags were pushed to the repository.
  - If the workflow fails, do not proceed with the rest of the release — investigate and resolve before creating the `central` release.
- [ ] On a new branch off `central-frontend`'s `master`, cherry-pick the version commit from the hotfix branch. Open a PR targeting `master`.
- [ ] 🔎 Review the PR. Verify it matches the version commit on the hotfix branch. Merge it to `master`.

### Release `central-backend`

> Optional section: skip it if no `central-backend` changes are included in the patch.

- [ ] Check out the `central-backend` hotfix branch for the patch (create it from the previous release tag if it doesn't exist), cherry-pick the commits for the patch from `master` onto it, and push the branch.
- [ ] 🔎 Verify the cherry-picked commits on the hotfix branch match what's expected for the patch.
- [ ] Create a GitHub release on the tip of the hotfix branch.
  - Tag: `v*.*.*` (no pre-release suffix).
  - Set as the **latest release**. Don't set as a pre-release.
  - Body: a single line pointing to the upcoming `central` release, e.g., `See release notes at https://github.com/getodk/central/releases/tag/vX.Y.Z`.

### Update versions

- [ ] If the patch includes `central-backend` changes, `cd server` and run:
  - `git fetch`
  - `git switch -d vXXXX.X.Y` (the `central-backend` release tag created above)
- [ ] If the patch includes `central-frontend` changes, update `FRONTEND_VERSION` in `docker-compose.yml` to the tag of the `central-frontend` release created above.
- [ ] Commit the updates using a new branch (e.g., `update-versions`). Create a new PR for the branch.
  - If the only change/PR to the `central` repository is these updates, target the `master` branch. Otherwise, target the hotfix branch.
- [ ] 🔎 Review the PR. Verify that the `server` diff links to the expected commit hashes and that `FRONTEND_VERSION` matches the `central-frontend` release tag.

### Merge

- [ ] If the patch involves more than a single change/PR to the `central` repository, then there should be a PR for the patch as a whole, targeting `master`. Merge it to `master`.
  - Select **"Create a merge commit"** when you merge.

### Release `central`

- [ ] Create a GitHub release for `central`. This will also create a Git tag.
  - Set as the **latest release**. Don't set as a pre-release.
  - Publish once you're ready to create the release and tag.
- [ ] Add release notes to the release.

  <details>
  <summary>📋 Release notes template — expand, fill in links, and paste into the GitHub release</summary>

  ```markdown
  ## Release Notes

  ### 🛠 Technical Changelogs
  For a detailed list of technical updates, fixes, and improvements, please review the specific changelogs below:

  <!-- CHANGELOG section anchors drop dots from the version number: 0.25.0 → #0250 -->
  * [back-end](https://github.com/getodk/central-backend/blob/master/docs/api.yaml)
  * [apps/central](https://github.com/getodk/central-frontend/tree/master/apps/central/CHANGELOG.md#<version-without-dots>)
  * [apps/forms](https://github.com/getodk/central-frontend/tree/master/apps/forms/CHANGELOG.md#<version-without-dots>)
  * [packages/web-forms](https://github.com/getodk/central-frontend/blob/master/packages/web-forms/CHANGELOG.md#<version-without-dots>)
  * [packages/xforms-engine](https://github.com/getodk/central-frontend/blob/master/packages/xforms-engine/CHANGELOG.md#<version-without-dots>)
  * [packages/xpath](https://github.com/getodk/central-frontend/tree/master/packages/xpath/CHANGELOG.md#<version-without-dots>)
  ```

  </details>

### Update API docs

- [ ] Update the API docs in the `docs` repository. Using a new branch in your fork of the `docs` repository, copy `central-backend/docs/api.yaml` to `docs/docs/_static/api-spec/central.yaml`. Create a new PR for the branch.
- [ ] 🔎 Review the PR.
- [ ] Merge any other relevant docs PRs.
- [ ] Check future release PRs. When you merge one of these, remove the `future release` label.

### Announce the release

- [ ] Reply to the topic for the latest release.

### Update news

- [ ] Create a new PR to update `central/docs/news.html`, branching off the `master` branch.
  - Link to the forum post. Limit the number of news items to 2. Target the `master` branch.
- [ ] 🔎 Review the PR. Feel free to "Squash and merge" when you merge.

### Update the `next` branch

> Do this once the news PR has been merged.

- [ ] If there has been a commit to the `next` branch that isn't on the `master` branch, then merge the `master` branch into the `next` branch. If there has not been a commit, then reset the `next` branch to the tip of the `master` branch.
