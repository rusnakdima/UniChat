# UniChat Flatpak

Files to build UniChat as a [Flatpak](https://flatpak.org/).

## Files

- `com.tcs.unichat.yml` — Flatpak manifest
- `com.tcs.unichat.desktop` — desktop entry
- `com.tcs.unichat.metainfo.xml` — AppStream metadata
- `build.sh` — helper script (builds Tauri with `bun run tauri:build:fast`, then runs `flatpak-builder`)

## Prerequisites

Install `flatpak` and `flatpak-builder`, and run from the repo root after `bun install`.

## Build

```bash
cd flatpak
chmod +x build.sh
./build.sh
```

Use `./build.sh no-build` if `../src-tauri/target/release/unichat` already exists.

## Install the bundle

```bash
flatpak install --user com.tcs.unichat.flatpak
flatpak run com.tcs.unichat
```

The first build downloads SDKs and can use several GB of disk space.
