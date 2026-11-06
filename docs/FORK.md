# Fork maintenance

This repository is an independent fork of [jeffvli/feishin](https://github.com/jeffvli/feishin). Plex support is maintained here, not upstream. Keep the original license, contributor credits and upstream links that document historical issues.

## Branches

- `development` is the default integration branch for all maintained features, including Plex.
- `origin` points to `p4rzl/feishin`; `upstream` points to `jeffvli/feishin`.
- Keep upstream synchronizations separate from fork-specific changes. Fetch upstream, review the diff and integrate deliberately; do not overwrite `development` with upstream or force-push its history.
- The old `feat/plex-support` branch is historical. New changes belong on `development` or short-lived branches based on it.

## Docker

Pushes to `development` publish AMD64/ARM64 images to `ghcr.io/p4rzl/feishin:development` and the compatibility alias `:plex`. These tags are development builds, not stable releases. Version tags (`vX.Y.Z`) and manual builds remain available through the Docker workflow.

Use the root `docker-compose.yaml` with a copy of `.env.example`. Both `FEISHIN_URL` and `PLEX_URL` are required so the Plex proxy cannot silently be omitted. Keep `.env` untracked. See [Plex setup](PLEX.md) for CORS, authentication and proxy security requirements.

## Desktop releases

Stable, beta and alpha builds publish to this fork's GitHub Releases. Alpha builds are manual, not scheduled, and no longer require access to the upstream Cloudflare R2 bucket. Release workflows create drafts for review before publication.

Application release links and update feeds use `src/shared/constants/project.ts`; electron-builder publish destinations must match that repository. The app name, app ID and licensing remain unchanged. Desktop installs can share settings with the original Feishin, so back up settings before switching builds. No upstream analytics script is loaded by this fork.

## Checks

```sh
pnpm test:fork
pnpm test:plex
pnpm test:plex:proxy
pnpm build:web
```

Use Node 24 LTS and the pnpm version pinned in `package.json`. The proxy check requires nginx on `PATH` or an explicit `NGINX_BINARY`. Headless web checks are documented in [Plex setup](PLEX.md). CI also runs full lint and typechecking; locally, follow `AGENTS.md` and lint staged files when committing.

Do not commit generated AppStream release changes, build output, credentials or local deployment settings as part of unrelated changes.
