# Windows Desktop: Install, Update, and Code Signing

Guide for building, distributing, and updating the **3D Viewer** Windows desktop app
(`electron-builder` + NSIS installer + portable EXE).

## Build artifacts

| Artifact | Purpose |
| -------- | ------- |
| `3D-Viewer-Setup-<version>-x64.exe` | NSIS installer (recommended for most users) |
| `3D-Viewer-Portable-<version>-x64.exe` | Single-file portable build (no installer) |
| `win-unpacked/` | Unpacked app folder (dev/testing; not for end users) |

Build locally:

```bash
npm run desktop:dist
```

Output goes to `dist/desktop-build/`.

## Why builds are unsigned today

All current Windows artifacts are **NotSigned** (verified with `Get-AuthenticodeSignature`).

Reasons:

1. **Signing was explicitly disabled** in older configs (`win.sign: null`). That is now removed so electron-builder can sign when certificate env vars are present.
2. **No code-signing certificate** is configured in this repo or CI. There is no `CSC_LINK`, `WIN_CSC_LINK`, or Azure Trusted Signing account wired up.
3. **CI has no signing secrets** — `.github/workflows/beta-validate.yml` runs `npm run desktop:dist` on Windows without certificate environment variables.

Unsigned downloads trigger **Windows SmartScreen** (“Windows protected your PC”) because the publisher is unknown and there is no Authenticode signature or reputation yet.

## Code signing: what you must buy vs what the repo configures

### You must provide (cannot be done in code alone)

| Item | Notes |
| ---- | ----- |
| **Code signing certificate** | OV (~$200–400/yr), EV (~$300–500/yr + hardware token), or **Azure Trusted Signing** (cloud, monthly) |
| **Certificate export / token** | OV: password-protected `.pfx`. EV: USB dongle — not exportable. Azure: Entra app + signing account |
| **CI secrets** (if signing in GitHub Actions) | `WIN_CSC_LINK` (or `CSC_LINK`), `WIN_CSC_KEY_PASSWORD` (or `CSC_KEY_PASSWORD`), or Azure `AZURE_*` vars |
| **Publisher reputation** | Even with a standard OV cert, SmartScreen may warn until enough users download your signed builds. **EV** or **Azure Trusted Signing** typically avoids the initial reputation wait |

### Already configured in this repo

- electron-builder `appId`: `com.3dviewer.app` (stable — do not change; drives NSIS upgrade identity)
- GitHub `publish` target for `latest.yml` / auto-update metadata
- Optional `electron-updater` hook in `electron/auto-updater.cjs` (checks GitHub Releases ~10s after launch)
- `npm run desktop:dist:publish` for CI/release uploads (requires `GH_TOKEN`)

### Signing options (2024–2026 best practice)

| Option | SmartScreen | CI-friendly | electron-builder setup |
| ------ | ----------- | ----------- | ---------------------- |
| **Standard OV** (.pfx) | Reputation builds over days/weeks | Yes — exportable `.pfx` | Env vars below |
| **EV certificate** | Immediate SmartScreen trust | Yes with HSM/dongle on build machine | `win.certificateSubjectName` + dongle plugged in; omit `CSC_LINK` |
| **Azure Trusted Signing** | Immediate | Yes | `win.azureSignOptions` + `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` |
| **SignPath / DigiCert KeyLocker** | Varies | Yes | HSM / cloud signing integrations |

References: [electron-builder code signing](https://www.electron.build/code-signing), [Windows signing](https://www.electron.build/win).

### Enable signing on your machine or CI

**Standard OV (.pfx) — most common for indie/CI:**

```powershell
# PowerShell (local build)
$env:WIN_CSC_LINK = "C:\secrets\3d-viewer.pfx"   # or base64 / https URL in CI
$env:WIN_CSC_KEY_PASSWORD = "your-pfx-password"
npm run desktop:dist
```

`CSC_LINK` / `CSC_KEY_PASSWORD` also work (cross-platform names).

**EV certificate (USB token):**

1. Install cert on the build PC (dongle inserted).
2. Add to `package.json` → `build.win.certificateSubjectName`: `"Your Company Name"` (exact subject from cert).
3. Do **not** set `CSC_LINK` / `CSC_KEY_PASSWORD`.
4. Run `npm run desktop:dist` — vendor auth UI may prompt for token PIN.

**Azure Trusted Signing (example):**

```json
"win": {
  "azureSignOptions": {
    "publisherName": "Mirjan",
    "endpoint": "https://eus.codesigning.azure.net/",
    "certificateProfileName": "your-profile",
    "codeSigningAccountName": "your-account"
  }
}
```

Set `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` in the build environment.

**Verify after build:**

```powershell
Get-AuthenticodeSignature "dist\desktop-build\3D-Viewer-Setup-*.exe" | Format-List
```

Status should be `Valid`, not `NotSigned`.

## Install and upgrade behavior

### NSIS installer (`3D-Viewer-Setup-*.exe`)

| Setting | Value | Effect |
| ------- | ----- | ------ |
| `oneClick` | `true` | Silent-style install; minimal prompts |
| `perMachine` | `false` | Per-user install under `%LOCALAPPDATA%\Programs\` |
| `appId` | `com.3dviewer.app` | Stable identity; NSIS derives a deterministic GUID from this |

**Upgrading an existing install:** Run the newer `3D-Viewer-Setup-<new-version>-x64.exe`. NSIS detects the previous install via the registry (same `appId`/GUID) and **upgrades in place**. Users do **not** need to uninstall first.

**Important:** Never change `appId` after users have installed — that breaks upgrade detection and can orphan uninstall entries.

### Portable (`3D-Viewer-Portable-*.exe`)

- Extracts/runs without an installer entry in Add/Remove Programs.
- **No automatic upgrade path.** Users must download and run a new portable EXE manually.
- Settings may live next to the EXE or in user data depending on how the portable build is launched.

### Version bumps

1. Bump `version` in `package.json` (semver, e.g. `3.18.0` → `3.19.0`).
2. Run `npm run desktop:dist`.
3. Upload `3D-Viewer-Setup-*.exe`, `3D-Viewer-Portable-*.exe`, and `latest.yml` to a GitHub Release tagged with the same version.

Installer file names include `${version}` so users can tell builds apart.

## Auto-update (optional)

The app includes a lightweight `electron-updater` integration:

- Enabled only when **packaged** and `DISABLE_AUTO_UPDATE` is not `1`.
- Checks GitHub Releases ~10 seconds after startup.
- Downloads updates in the background; installs on app quit.

**Requirements for auto-update to work:**

1. Signed builds are strongly recommended on Windows (updater validates signatures).
2. Releases must include `latest.yml` (generated when `publish` is configured — `npm run desktop:dist` creates it locally; `desktop:dist:publish` uploads to GitHub).
3. GitHub Release tag must match `package.json` `version`.

**Disable for testing:**

```powershell
$env:DISABLE_AUTO_UPDATE = "1"
```

**Publish a release from CI:**

```bash
# GH_TOKEN with repo scope required
npm run desktop:dist:publish
```

## Packaged app launch notes

- `npm run desktop:dev` uses the Vite dev server; the packaged EXE serves static files from `app.asar`.
- Automated/headless launches (`WindowStyle Hidden`, no interactive desktop) may exit immediately on Windows — this is an environment limitation, not necessarily an app bug.
- After code changes to `electron/main.cjs`, rebuild with `npm run desktop:dist` before testing `win-unpacked/3D Viewer.exe`.

## Quick checklist for a signed GitHub release

1. [ ] Purchase/configure code signing (OV, EV, or Azure)
2. [ ] Add signing secrets to GitHub Actions (or sign locally)
3. [ ] Bump `version` in `package.json`
4. [ ] `npm run desktop:dist` (or `desktop:dist:publish` with `GH_TOKEN`)
5. [ ] Confirm `Get-AuthenticodeSignature` → `Valid`
6. [ ] Create GitHub Release with Setup EXE, Portable EXE, and `latest.yml`
7. [ ] Smoke-test: install over previous version, confirm upgrade without uninstall
