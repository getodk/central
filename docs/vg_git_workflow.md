# VG Git Workflow (Central + Submodules)

This repo uses a `vg-work` branch for customizations in:
- `central` (this repo)
- `client` (submodule)
- `server` (submodule)

## Golden Rules
- Always work on `vg-work` in all three repos.
- Commit changes inside the submodule first, then update the pointer in `central`.
- Rebase `vg-work` onto upstream `master` periodically (every few months).

## Daily Workflow

1) Update `central` and submodules to current pointers:
```bash
git pull
git submodule update --recursive
```

2) Work in `server` or `client`, commit, and push:
```bash
cd server
git checkout vg-work
git pull
# edit...
git add .
git commit -m "feat: <message>"
git push
```

```bash
cd ../client
git checkout vg-work
git pull
# edit...
git add .
git commit -m "feat: <message>"
git push
```

3) Update submodule pointers in `central`, then commit and push:
```bash
cd ..
git add server client
git commit -m "Update submodule pointers"
git push
```

## Periodic Rebase onto Upstream Master

Do this for each repo: `server`, `client`, and `central`, in that order.

1) Rebase submodules first:
```bash
cd server
git fetch origin
git checkout vg-work
git rebase origin/master
git push --force-with-lease
```

```bash
cd ../client
git fetch origin
git checkout vg-work
git rebase origin/master
git push --force-with-lease
```

2) Rebase `central` last (after updating submodule pointers):
```bash
cd ..
git fetch origin
git checkout vg-work
git rebase origin/master
git add server client
git commit -m "Update submodule pointers after rebase"
git push --force-with-lease
```

## Safety Checks
- See current branches:
  ```bash
  git status -sb
  git -C server status -sb
  git -C client status -sb
  ```
- See submodule pointer changes:
  ```bash
  git diff --submodule
  ```
