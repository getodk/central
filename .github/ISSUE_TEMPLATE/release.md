---
name: Release
about: Checklist for releasing a new version of ODK Central
title: 'Release vXXXX.X.Y'
type: 'Task'
labels: ''
assignees: ''
---

Complete the steps below to release a new version of ODK Central.

> **Legend**
> - 🚀 Major release only
> - 🛠 Patch release only
> - 🔎 Requires the second person (reviewer)
> - Unmarked steps apply to **both** major and patch releases.

Releasing requires two people: one person to push PRs and complete other tasks and another person to review the PRs.

---

## Steps

- [ ] Decide the release version (`vXXXX.X.Y`). The same version is used for `central`, `central-backend`, and `central-frontend`, so the `central` release URL (`https://github.com/getodk/central/releases/tag/vXXXX.X.Y`) can be referenced from the `central-frontend` and `central-backend` release bodies.
- [ ] Write an announcement about the release for the forum.
- [ ] 🚀 Create a new topic in the forum for the release. Use the **Scheduled** category and add the `odk-central` label.

### Get the repository

- [ ] Get the latest version of the `central` repository locally.
  - If you have **not** cloned the repository: clone it.
  - If you had **already** cloned the repository: `git pull`
- [ ] Check out the correct branch.
  - 🚀 Check out the `next` branch.
  - 🛠 If the patch involves a single change/PR to the `central` repository, check out the `master` branch. Otherwise, a different branch will be used for the patch (possibly `next`); check out that branch.

### Release `central-frontend`

> Applies when `central-frontend` has changed since the last release. Major releases always include `central-frontend`; for patches, skip this section if no central-frontend changes are included.

- [ ] Run `npm run version` in `central-frontend`. This consumes the `.changeset/` files, bumps package versions, and updates each `CHANGELOG.md`.
- [ ] Commit the changes on a new branch (e.g., `release-version-bumps`) and open a PR targeting `master`.
- [ ] 🔎 Review the PR. Verify the version bumps and `CHANGELOG.md` entries match what's expected from the `.changeset/` files.
- [ ] Merge the PR.
- [ ] In `central-frontend`, create a minimal GitHub release on the merged commit. The tag push is what triggers `.github/workflows/wf-publish.yml` to publish packages to npm — full release notes live only in the `central` release.
  - Tag: `v*.*.*` (no pre-release suffix).
  - Set as the **latest release**. Don't set as a pre-release.
  - Body: a single line pointing to the upcoming `central` release, e.g., `See release notes at https://github.com/getodk/central/releases/tag/vX.Y.Z`.
- [ ] Wait for `wf-publish.yml` to complete, then verify:
  - The Actions run finished green.
  - The expected packages were published to npm.
  - Per-package tags were pushed to the repository.
  - If the workflow fails, do not proceed with the rest of the release — investigate and resolve before creating the `central` release.

### Release `central-backend`

> Applies when `central-backend` has changed since the last release. Major releases always include `central-backend`; for patches, skip this section if no central-backend changes are included.

- [ ] Create a GitHub release on the latest `master` commit of `central-backend`.
  - Tag: `v*.*.*` (no pre-release suffix).
  - 🚀 Don't forget the final `XXXX.X.0` in the tag and release title.
  - Set as the **latest release**. Don't set as a pre-release.
  - Body: a single line pointing to the upcoming `central` release, e.g., `See release notes at https://github.com/getodk/central/releases/tag/vX.Y.Z`.

### Update submodules

- [ ] For each of the server and client submodules, `cd` into the directory and run:
  - `git fetch`
  - `git switch -d origin/master` or `git checkout origin/master`
- [ ] Commit the submodule updates using a new branch (e.g., `update-submodules`). Create a new PR for the branch.
  - 🚀 Target the `next` branch.
  - 🛠 If the only change/PR to the `central` repository is the submodule updates, target the `master` branch. Otherwise, a different branch will be used for the patch (possibly `next`); target that branch.
- [ ] 🔎 Review the PR. For each submodule, the diff in GitHub will link to a page that indicates the old and new commit hashes.

### Merge

- [ ] 🚀 Once the submodules PR has been merged into the `next` branch, use the existing release PR to merge `next` into the `master` branch.
  - Select **"Create a merge commit"** when you merge.
  - Don't delete the `next` branch after merging.
- [ ] 🛠 If the patch involves more than a single change/PR to the `central` repository, then there should be a PR for the patch as a whole. Merge it.
  - Select **"Create a merge commit"** when you merge.
  - If the PR used the `next` branch, don't delete the `next` branch after merging.

### Release `central`

- [ ] Create a GitHub release for `central`. This will also create a Git tag.
  - 🚀 Don't forget the final `XXXX.X.0` in the tag and release title.
  - Set as the **latest release**. Don't set as a pre-release.
  - Publish once you're ready to create the release and tag.
- [ ] Add release notes to the release.
  - 🚀 Link to the release announcement in the forum.

  <details>
  <summary>📋 Release notes template — expand, fill in links, and paste into the GitHub release</summary>

  ```markdown
  ## Release Notes

  📢 **[Read the official release announcement on the Forum!](insert-forum-link-here)**

  We highly recommend checking out the forum post for a user-friendly overview of new features, enhanced with screenshots and guides.

  ---

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

- [ ] 🚀 Move the forum topic from the **Scheduled** category to the **Releases** category.
- [ ] 🛠 Reply to the topic for the latest release.

### Update news

- [ ] Create a new PR to update `central/docs/news.html`, branching off the `master` branch.
  - Link to the forum post. Limit the number of news items to 2. Target the `master` branch.
- [ ] 🔎 Review the PR. Feel free to "Squash and merge" when you merge.

### Update the `next` branch

> Do this once the news PR has been merged.

- [ ] 🚀 Reset the `next` branch to the tip of the `master` branch. The `master` branch will be ahead of the `next` branch, so this doesn't require a force-push.
- [ ] 🛠 If there has been a commit to the `next` branch that isn't on the `master` branch, then merge the `master` branch into the `next` branch. If there has not been a commit, then reset the `next` branch to the tip of the `master` branch.
