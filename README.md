<img src="assets/icons/icon.png" alt="logo" title="feishin" align="right" height="60px" width="60px" />

# Feishin

This is [p4rzl's independently maintained fork](https://github.com/p4rzl/feishin) of [Feishin](https://github.com/jeffvli/feishin), with Plex support, listening activity reporting and an optional Docker CORS proxy. Plex support is maintained here, not by the upstream developers. Report fork-specific issues in [this repository](https://github.com/p4rzl/feishin/issues).

`development` is the integration branch. See [fork maintenance](docs/FORK.md) and [Plex setup](docs/PLEX.md).

  <p align="center">
    <a href="https://github.com/p4rzl/feishin/blob/development/LICENSE">
      <img src="https://img.shields.io/github/license/p4rzl/feishin?style=flat-square&color=brightgreen"
      alt="License">
    </a>
      <a href="https://github.com/p4rzl/feishin/releases">
      <img src="https://img.shields.io/github/v/release/p4rzl/feishin?style=flat-square&color=blue"
      alt="Release">
    </a>
    <a href="https://github.com/p4rzl/feishin/releases">
      <img src="https://img.shields.io/github/downloads/p4rzl/feishin/total?style=flat-square&color=orange"
      alt="Downloads">
    </a>
  </p>
---

Rewrite of [Sonixd](https://github.com/jeffvli/sonixd).

## Features

- [x] MPV player backend
- [x] Web player backend
- [x] Modern UI
- [x] Scrobble playback to your server
- [x] Smart playlist editor (Navidrome)
- [x] Synchronized and unsynchronized lyrics support
- [x] Plex browser sign-in, music libraries, playlists and listening activity
- [ ] [Request a feature](https://github.com/p4rzl/feishin/issues)

## Screenshots

<a href="./media/preview_full_screen_player.png"><img src="./media/preview_full_screen_player.png" width="49.5%"/></a> <a href="./media/preview_album_artist_detail.png"><img src="./media/preview_album_artist_detail.png" width="49.5%"/></a> <a href="./media/preview_album_detail.png"><img src="./media/preview_album_detail.png" width="49.5%"/></a> <a href="./media/preview_smart_playlist.png"><img src="./media/preview_smart_playlist.png" width="49.5%"/></a>

## Getting Started

### Desktop (recommended)

Desktop builds from this fork are published in [GitHub Releases](https://github.com/p4rzl/feishin/releases). Until a desktop release is available, build locally with `pnpm package:linux:pr`, `pnpm package:mac:pr` or `pnpm package:win:pr`. The desktop client supports both the MPV and web player backends, as well as built-in fetching for lyrics.

#### macOS Notes

If you're using a device running macOS 12 (Monterey) or higher, [check here](https://github.com/jeffvli/feishin/issues/104#issuecomment-1553914730) for instructions on how to remove the app from quarantine.

For media keys to work, you will be prompted to allow Feishin to be a Trusted Accessibility Client. After allowing, you will need to restart Feishin for the privacy settings to take effect.

#### Linux Notes

The original Feishin is available in [Flathub](https://flathub.org/en/apps/org.jeffvli.feishin). That package is maintained upstream and does not include this fork's Plex changes.

Alternatively, you can install it as an Appimage. We provide a small install script to download the latest `.AppImage`, make it executable, and also download the icons required by Desktop Environments. Finally, it generates a `.desktop` file to add Feishin to your Application Launcher.

Simply run the installer like this:

```sh
dir=/your/application/directory
curl 'https://raw.githubusercontent.com/p4rzl/feishin/refs/heads/development/install-feishin-appimage' | sh -s -- "$dir"
```

The script also has an option to add launch arguments to run Feishin in native Wayland mode. Note that this is experimental in Electron and therefore not officially supported. If you want to use it, run this instead:

```sh
dir=/your/application/directory
curl 'https://raw.githubusercontent.com/p4rzl/feishin/refs/heads/development/install-feishin-appimage' | sh -s -- "$dir" wayland-native
```

It also provides a simple uninstall routine, removing the downloaded files:

```sh
dir=/your/application/directory
curl 'https://raw.githubusercontent.com/p4rzl/feishin/refs/heads/development/install-feishin-appimage' | sh -s -- "$dir" remove
```

The entry should show up in your Application Launcher immediately. If it does not, simply log out, wait 10 seconds, and log back in. Your Desktop Environment may alternatively provide a way to reload entries.

### Web and Docker

Self-host this fork's web client using Docker. The upstream hosted client at [feishin.vercel.app](https://feishin.vercel.app) does not include this fork's Plex changes. The web client only supports the web player backend.

Fork images are published to [GHCR](https://github.com/p4rzl/feishin/pkgs/container/feishin). Every push to `development` builds the `development` tag and the compatibility alias `plex` for AMD64 and ARM64.

```bash
# Run the development version
docker run --name feishin -p 9180:9180 ghcr.io/p4rzl/feishin:development

# Build the image locally
docker build -t feishin .
docker run --name feishin -p 9180:9180 feishin
```

#### Docker Compose

The included Compose file configures Plex through the same-origin proxy, avoiding browser CORS restrictions. Set both URLs before starting:

```bash
cp .env.example .env
# Edit .env: FEISHIN_URL is the browser-visible site origin;
# PLEX_URL is the Plex origin reachable from the container.
docker compose pull
docker compose up -d
```

For example, use `FEISHIN_URL=http://192.168.1.150:9180` and `PLEX_URL=http://192.168.1.150:32400`. Use your HTTPS site origin for remote browser access. Do not include a trailing slash in `FEISHIN_URL`.

For Portainer, import `docker-compose.yaml` and provide those environment variables in the stack configuration. See [Plex setup and security requirements](docs/PLEX.md). Jellyfin, Navidrome and Subsonic remain supported through the normal server configuration, without the Plex proxy.

### Configuration

1. Upon startup you will be greeted with a prompt to select the path to your MPV binary. If you do not have MPV installed, you can download it [here](https://mpv.io/installation/) or install it using any package manager supported by your OS. After inputting the path, restart the app.

2. After restarting the app, you will be prompted to select a server. Click the `Open menu` button and select `Manage servers`. Click the `Add server` button in the popup and fill out all applicable details. For Plex, choose **Sign in with Plex** to authorize in your browser and discover your servers automatically. Other server types require the full URL, including the protocol and port if applicable (e.g. `https://navidrome.my-server.com` or `http://192.168.0.1:4533`).

- **Navidrome** - For the best experience, select "Save password" when creating the server and configure the `SessionTimeout` setting in your Navidrome config to a larger value (e.g. 72h).
    - **Linux users** - The default password store uses `libsecret`. `kwallet4/5/6` are also supported, but must be explicitly set in Settings > Window > Passwords/secret store.

3. _Optional_ - If you want to host Feishin on a subpath (not `/`), then pass in the following environment variable: `PUBLIC_PATH=PATH`. For example, to host on `/feishin`, pass in `PUBLIC_PATH=/feishin`.

4. _Optional_ - To hard code the server url, pass the following environment variables: `SERVER_NAME`, `SERVER_TYPE` (one of `jellyfin`, `navidrome`, `plex` or `subsonic`), `SERVER_URL`. To prevent users from changing these settings, pass `SERVER_LOCK=true`. This requires all three values, except for Plex browser sign-in, where `SERVER_NAME` and `SERVER_URL` are optional. When `SERVER_LOCK=true`, you can also set `LEGACY_AUTHENTICATION=true` or `LEGACY_AUTHENTICATION=false` to configure the legacy authentication flag for the server (only applicable for Subsonic/OpenSubsonic servers).

5. _Optional_ - If your server uses a separate public-facing URL than what integrating applications use internally to communicate with your server, such as a separate Navidrome `ShareURL`, set `REMOTE_URL` to said public-facing URL.

6. This fork does not load upstream analytics. `ANALYTICS_DISABLED` remains accepted for compatibility with existing deployments.

7. _Optional_ - App settings (theme, language, sidebar options, etc.) can be overridden with environment variables on first run. The variables use the `FS_` prefix (e.g. `FS_GENERAL_THEME=defaultDark`, `FS_GENERAL_LANGUAGE=de`). See [the settings environment variable documentation](docs/ENV_SETTINGS.md) for the full list.

## FAQ

### MPV is either not working or is rapidly switching between pause/play states

First thing to do is check that your MPV binary path is correct. Navigate to the settings page and re-set the path and restart the app. If your issue still isn't resolved, try reinstalling MPV. Known working versions include `v0.35.x` and `v0.36.x`. `v0.34.x` is a known broken version.

### What music servers does Feishin support?

Feishin supports [Plex](https://www.plex.tv/), and music servers that implement a [Navidrome](https://www.navidrome.org/), [Jellyfin](https://jellyfin.org/), or [OpenSubsonic compatible](https://opensubsonic.netlify.app/) API.

- [Navidrome](https://github.com/navidrome/navidrome)
- [Jellyfin](https://github.com/jellyfin/jellyfin)
- [OpenSubsonic](https://opensubsonic.netlify.app/) compatible servers, such as...
    - [Airsonic-Advanced](https://github.com/airsonic-advanced/airsonic-advanced)
    - [Ampache](https://ampache.org)
    - [Astiga](https://asti.ga/)
    - [Funkwhale](https://www.funkwhale.audio/)
    - [Gonic](https://github.com/sentriz/gonic)
    - [LMS](https://github.com/epoupon/lms)
    - [Nextcloud Music](https://apps.nextcloud.com/apps/music)
    - [Supysonic](https://github.com/spl0k/supysonic)
    - [Qm-Music](https://github.com/chenqimiao/qm-music)
    - More (?)

- [Plex](https://www.plex.tv/media-server-downloads)
    - Browser sign-in with automatic server discovery, plus optional manual-token support. See [Plex setup and limitations](docs/PLEX.md).

### I have the issue "The SUID sandbox helper binary was found, but is not configured correctly" on Linux

This happens when you have user (unprivileged) namespaces disabled (`sysctl kernel.unprivileged_userns_clone` returns 0). You can fix this by either enabling unprivileged namespaces, or by making the `chrome-sandbox` Setuid.

```bash
chmod 4755 chrome-sandbox
sudo chown root:root chrome-sandbox
```

Ubuntu 24.04 specifically introduced breaking changes that affect how namespaces work. Please see https://discourse.ubuntu.com/t/ubuntu-24-04-lts-noble-numbat-release-notes/39890#:~:text=security%20improvements%20 for possible fixes.

### How can I add custom themes?

On the desktop app, you can add custom themes by dropping JSON files into the Themes folder (Settings → General → Theme → Open Folder). See [the custom themes documentation](docs/CUSTOM_THEMES.md) for the file format and examples.

## Development

Use Node 24 LTS and the pnpm version pinned in `package.json`. Typechecking runs in CI; run the Plex regression checks locally with `pnpm test:plex` and `pnpm test:plex:proxy` (requires nginx).

This project is built off of [electron-vite](https://github.com/alex8088/electron-vite)

- `pnpm run dev` - Start the development server
- `pnpm run dev:watch` - Start the development server in watch mode (for main / preload HMR)
- `pnpm run start` - Starts the app in production preview mode
- `pnpm run build` - Builds the app for desktop
- `pnpm run build:electron` - Build the electron app (main, preload, and renderer)
- `pnpm run build:remote` - Build the remote app (remote)
- `pnpm run build:web` - Build the standalone web app (renderer)
- `pnpm run package` - Package the project
- `pnpm run package:dev` - Package the project for development locally
- `pnpm run package:linux` - Package the project for Linux locally
- `pnpm run package:mac` - Package the project for Mac locally
- `pnpm run package:win` - Package the project for Windows locally
- `pnpm run publish:linux` - Publish the project for Linux
- `pnpm run publish:linux:beta` - Publish the project for Linux (beta channel)
- `pnpm run publish:linux-arm64` - Publish the project for Linux ARM64
- `pnpm run publish:linux-arm64:beta` - Publish the project for Linux ARM64 (beta channel)
- `pnpm run publish:mac` - Publish the project for Mac
- `pnpm run publish:mac:beta` - Publish the project for Mac (beta channel)
- `pnpm run publish:win` - Publish the project for Windows
- `pnpm run publish:win:beta` - Publish the project for Windows (beta channel)
- `pnpm run typecheck` - Type check the project
- `pnpm run typecheck:node` - Type check the project with tsconfig.node.json
- `pnpm run typecheck:web` - Type check the project with tsconfig.web.json
- `pnpm run lint` - Lint the project
- `pnpm run lint:fix` - Lint the project and fix linting errors
- `pnpm run i18next` - Generate i18n files

## Translation

Upstream translations are maintained on [Weblate](https://hosted.weblate.org/projects/feishin/). Submit translations for fork-specific features through this repository.

## License

[GNU General Public License v3.0](LICENSE). Original Feishin and contributor copyrights are preserved.
