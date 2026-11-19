# Goalify Companion

Goalify Companion is a standalone, opt-in desktop app for Goalify on WoW Forever. After logout or `/reload`, it reads `Goalify.lua` from a chosen World of Warcraft folder. It does not modify game files or play the game. It requires both Goalify's in-game Community Sharing setting and separate consent for each account.

## Download

The latest local Store package is 0.1.6 (see verified build details below).
It is not yet a certified/published Store release and does not update the
separate standalone EXE downloads automatically.

Get the standalone Windows x64 installer from [Releases](https://github.com/Howardmgiv/goalify-companion/releases) or [goalify.griffify.com](https://goalify.griffify.com/#companion). Builds are unsigned, so Windows SmartScreen may warn you. Before running the installer, compare its SHA-256 with the release notes: `Get-FileHash .\Goalify-Companion-Setup-0.1.6.exe -Algorithm SHA256`. You can also build it yourself from this source (see below).

Version 0.1.2 adds guard/service/training/flight source exports and historical
backfill. Version 0.1.1 cannot upload those datasets. The account cards show the
last game-file save and eligible counts by source type; use `/reload` to persist
current interactions. Repeated visits update source facts, not necessarily the
number of unique aggregated sources. Refresh review queue/Publish on the website
cannot read unsaved game memory or upgrade an older installed companion.

## Use

Version 0.1.6 places the compass at the header's upper left and centers the
Goalify banner in the main body, below the header bar and above Welcome.
The app title, version and support button remain in the header.
Welcome explicitly distinguishes
in-game goal management from this optional desktop sharing companion.
The addon must still be installed separately.
The interface uses the website's gold accents (`#efd18b`, `#d4ad61`) and
warm ivory text on charcoal/brown panels, replacing blue UI colors including
links, focus outlines and radio/checkbox accents. Original artwork is unchanged;
destructive actions retain a warm red warning treatment.
The Store listing tile uses the Goalify addon image; the simpler compass
remains the small Windows/taskbar icon for readability. Original addon images
and previous MSIX packages are unchanged.

Version 0.1.3 adds **About & updates** alongside the existing header version.
It identifies Store/MSIX, standalone or development builds without reading
game files. **Open Microsoft Store updates** opens the Store's update page;
standalone builds link to the app's Store listing instead. This is not a
background update check and never claims the installed version is current.

### Updating without losing settings

Normal Store-to-Store updates are installed in place; no uninstall/reinstall
is needed. Enable app updates in Microsoft Store settings, or open the Store
updates page from About. The Store may wait for the app to close. Keep the
same package identity, publisher, application ID and product/user-data name
across releases, and increase the package version. Settings, encrypted token,
consent, sending mode, watermarks and pending batches remain in the existing
per-user data directory rather than the versioned installation directory.
The loader retains saved configuration; About/updates do not reset it.
Native signed Store-to-Store update testing remains pending.

Moving from the standalone EXE to the Store is a separate installation;
automatic settings/credential migration is not implemented. Do not promise
that transition preserves settings, and do not uninstall the existing app
before reviewing the migration. Normal updates are not the same as Reset,
uninstall, or **Delete my shared data**, which can remove data.

### Suggested Store hardware declarations

These are for the companion, not WoW. Recommend keyboard and mouse; leave
their minimum checkboxes and all other listed hardware checkboxes unchecked.
Leave memory, DirectX and video memory **Not specified**, with processor and
graphics text blank unless validated requirements become available. No numeric
memory or GPU minimum has been benchmarked. Target OS/architecture are declared
by the MSIX: Windows 10 build 19041 or newer, x64, Windows desktop.
The app requires the Goalify addon and access to the user's chosen WoW
SavedVariables; internet access is needed for sharing and Store updates,
not for offline previews.

For **Device family availability**, select **Windows 10/11 Desktop** only.
This includes compatible Windows laptops, tablets and gaming handhelds as
well as desktop PCs. Leave Mobile, Xbox, Team, Mixed Reality, Windows 8/8.1
and Windows Phone unchecked. The current Store manifest targets Windows.Desktop,
Windows 10 build 19041 or newer, x64; a checkbox cannot add unsupported targets.
Mac/Linux distributions are separate from this MSIX, and native Windows ARM
compatibility has not been verified. This is not yet a package for every
platform on which WoW can potentially run.

### Sharing observations

Install and launch the app. Choose the World of Warcraft or `_forever_` folder if detection fails. Review the masked account, enable Community Sharing in Goalify, refresh after logout or `/reload`, and tick consent. By default (**Send automatically**) the app uploads new records while it is open: at start, every 10 minutes, and after Refresh, up to four batches per cycle. Nothing is sent without consent and the in-game Community Sharing opt-in, and nothing is sent while the app is closed. Choose **Preview each batch before sending** in Settings to review readable cards (raw JSON under Details) and click Send yourself. Installs upgraded from 0.1.0 stay in preview mode until you choose **Send automatically**. Any text matching one of the account's own character or realm names is removed before the preview. Stop sharing pauses all uploads. Revoke account consent to discard its pending retry. Account folder names never leave the computer.

A failed attempted upload is retained for explicit retry with the same batch ID, is visible as pending, and is retried on the next automatic cycle, or when you preview and send it again in manual mode. A successful response advances the account's watermark. Large datasets are divided into multiple batches; preview and send each remaining batch. A rejected-record count is shown if the service skips records. A timestamp shared across batches is handled without skipping other observations at that timestamp.

The source-data upgrade performs a one-time full re-extraction per account, including observations older than the old watermark. An existing pending batch is retried unchanged first; backfill progress advances only after acknowledgement. Previously sent records can be reported again under new batch IDs; the service aggregates by install. If the service has not enabled its new source schema, the batch remains pending.

## Privacy and deletion

Only NPC services, guard locations and observed questions, guard-reported destination points, training offers, generic flight nodes, vendors, loot and profession trainers, with their identifiers, names, approximate locations and captured timestamps/builds, are sent. Transport tags describe guard directions, not flight routes. Character, realm and account names, GUIDs, training status, unlocked/known/reachable flight paths, goals, gold balances, inventory, mail and notes are never exported. The optional credit name is sent separately and only when saved. The anonymous install token is encrypted using Electron safeStorage; configuration, consent, retry payloads and watermarks are held in the app's local user data directory. Disable sharing in either place to prevent uploads. Delete my shared data asks the service to delete this install and its observations, then removes the local credentials, pending batches, watermarks and consent. Deletion requires connectivity and the original token.

Native guard destination POI zero is valid, and positive IDs can also be reused. Distinct saved direction records retain their names, coordinates and selected class/profession topics, even when they share an ID or a building. The API must keep these destination/question identities separate during aggregation. A POI identifier is not an NPC identity or a reason to discard another saved destination.

Untimestamped legacy `GuardDirectory.Classes` and `Repairs` are not exported: another observation of the same NPC does not establish when the class or repair claim was observed. They need a future timestamped capture. Flight route edges are not exported yet; no location is fabricated for an edge.

[Privacy policy](https://goalify.griffify.com/privacy-policy.html)

## Development and packaging

Requires Node.js and npm. `npm ci`, `npm test`, `npm start`, or `npx electron-builder --win --x64` (unsigned local NSIS build). macOS DMG is configured but must be built and tested on macOS. Generated output is under `dist/` and is ignored by Git. Releases are unsigned until a code-signing certificate is added; every release lists the installer's SHA-256 and the commit it was built from.

### Microsoft Store (MSIX desktop app)

Copy-ready English listing fields, screenshot captions and upload guidance
are in [the Store listing draft](store-listing/en-US.md). The listing's
[300 x 300 app tile icon](store-listing/logos/Goalify-Companion-App-Tile-300.png)
reuses the full Goalify addon artwork. Installed-app screenshots are pending
owner-provided captures; the synthetic browser preview is not used as one.

Run `npm test`, then `npm run package:store` on Windows. The separate
[Store configuration](electron-builder.store.cjs) preserves NSIS settings and
existing installers. It builds current source, not a previous `win-unpacked`
directory, and writes `dist/microsoft-store/<version>/Goalify-Companion-<version>-x64.msix`.
Existing Store packages are not overwritten; increment the app version for
another release. The pinned builder uses its AppX backend with the Microsoft
MakeAppx tool to create the `.msix` directly: these formats share the manifest
and packaging infrastructure. No renamed EXE, PWA wrapper or game package is used.
The [asset generator](build/generate-store-assets.ps1) resizes existing branding
without changing its aspect ratio; no new dependencies are needed.

Partner Center identity:

- Package name: `GriffifyStudiosLLC.GoalifyCompanion`
- Publisher: `CN=7422D0EA-D803-4A04-B66A-86C20F2C0391`
- Publisher display name: `Griffify Studios LLC`
- Expected family: `GriffifyStudiosLLC.GoalifyCompanion_a74avpk4cy1hg`
- Store ID: `9N4167K6C8CN`

Submit as **MSIX app**, not EXE/MSI, PWA or Game. The Store build is unsigned
for Microsoft to sign during submission; do not sideload it as a trusted
installer or create/trust a development certificate on users' computers.
Windows 10 build 19041 or newer, x64 only, English UI. Only `internetClient`
and the Electron-required `runFullTrust` capabilities are declared. Explain
`runFullTrust` in certification notes: the Electron main process uses a native
folder picker to read the user's selected WoW SavedVariables, parses data
without executing Lua, stores consent locally, and uploads allowlisted
observations only with both in-game opt-in and per-account consent. It does
not modify game files, automate gameplay or require administrator access.
The owner's 0.1.2 Partner Center upload reported the restricted-capability
approval warning for `runFullTrust`. This is expected for packaged Electron:
keep the capability and provide the reason in the restricted-capability
declaration (and certification notes). The capability permits the Win32
desktop process to run; it does not itself grant administrator privileges.
Microsoft's review/approval remains required; the warning is not evidence
of either approval or rejection.

Upload the MSIX under the app's submission **Packages** page, confirm the
identity/version, complete Store listings/screenshots, age rating, privacy
policy and certification notes, and review certification results before
publishing. Use the existing [privacy policy](https://goalify.griffify.com/privacy-policy.html).
Native packaged launch, folder access, safeStorage, upgrade/uninstall and
production API compatibility still require testing; successful packaging and
unit tests do not establish Store certification or production readiness.
Store-packaged user data may be isolated from the standalone install: verify
first-run consent and do not assume automatic migration. No submission,
installation, certificate trust change or production API deployment occurs
when building.

Latest local Store build verified: companion **0.1.6**, package **0.1.6.0**,
x64, Electron 45.3.2. All 21 companion tests pass. Browser checks at 700,
781, 1000 and 1920 px verify the compass at the header's upper left and the
banner centered in the main body, below the header and above Welcome, without
distortion or horizontal overflow. The gold palette matches the website's
accent values; 15 sampled normal/hover text states exceed 4.5:1 contrast
(minimum measured 6.76:1), with a visible gold keyboard-focus outline.
The unsigned manifest retains the existing Store identity, application ID,
desktop target and capabilities. The executable, ASAR, all 11 runtime
sources/assets and four compass package images are byte-verified. Original
banner/compass assets and previous 0.1.4/0.1.5 MSIX files are unchanged.
Native installation, signed upgrades and Store approval remain pending;
the browser preview uses synthetic data, not installed-app Store captures.

- File: `dist/microsoft-store/0.1.6/Goalify-Companion-0.1.6-x64.msix`
- Size: 167364648 bytes
- SHA-256: `978F660417C51A1F9D0EE551FAF5E9CE753F05E1ACB181F126449B35A80CEDF8`

Previous local Store build verified: companion **0.1.4**, package **0.1.4.0**,
x64, Electron 45.3.2. All 21 companion tests pass. Both Welcome images match
the original 1254 x 1254 addon PNGs byte-for-byte; the listing tile is a
300 x 300 PNG derived from the full Goalify image. Browser checks at 1000 px
and 700 px confirm loaded, undistorted artwork without overlap or horizontal
overflow. This preview uses synthetic data, not installed-app Store captures.
The unsigned manifest retains the existing Store identity, application ID,
desktop minimum version and capabilities. The executable, ASAR, all 11 runtime
sources/assets and four compass package images are byte-verified. The small
Windows compass source and previous 0.1.2/0.1.3 MSIX files are unchanged.
Native installation, signed upgrades and Store approval remain pending.

- File: `dist/microsoft-store/0.1.4/Goalify-Companion-0.1.4-x64.msix`
- Size: 170193273 bytes
- SHA-256: `858CFBAB0F1DB5FAF4AA017D6C00E537CF5A2C3E98184311379A89EAC58F8049`

Previous local Store build verified 2026-11-16: companion **0.1.3**, package
**0.1.3.0**, x64, Electron 45.3.2. All 21 companion tests pass, including
version/channel metadata independent of unavailable game files, fixed Store
links and unchanged saved consent/credentials/cursors/retries. Browser UI
preview with synthetic data confirms About and its update action; this is
not a native Store integration test. The manifest retains the same package
and application identities as 0.1.2, with only the package version advanced.
The executable/ASAR and all nine runtime sources/assets are verified.

- File: `dist/microsoft-store/0.1.3/Goalify-Companion-0.1.3-x64.msix`
- Size: 163273119 bytes
- SHA-256: `1ED895D79185482C4EAA5AD1567D0257063C265D852239FFB0245D727290D02E`

Previous local Store build verified 2026-11-16: companion **0.1.2**, package
**0.1.2.0**, x64, Electron 45.3.2. All 19 companion tests pass. The generated
manifest's identity/publisher/version/capabilities and executable were checked;
the publisher-derived family matches Partner Center. The MSIX's `app.asar`
matches the fresh build, and all nine runtime code/assets match current source.
Previous 0.1.0/0.1.1 EXE installers are unchanged. This is not a security review,
native installation test, certification result or production API clearance.

- File: `dist/microsoft-store/0.1.2/Goalify-Companion-0.1.2-x64.msix`
- Size: 163272471 bytes
- SHA-256: `E6AA360BF8C368ACA84E86F8A8CF1189EF37C1EF97001F1D761F6DE4B99EB078`

The production API is `https://goalify.griffify.com/api/v1` (set in `lib/config.js`); its contract is documented in the goalify-site repository (`api/API.md`). Shared sources are published only after the Goalify admin reviews them. For local development only, `GOALIFY_API_BASE` may override it; HTTP is accepted only for localhost/127.0.0.1, and HTTPS only for localhost or the configured production host. No API connection is needed to preview data.

## License

Source-available: you may read, audit and build this code for personal verification, but not copy, modify or redistribute it. See [LICENSE](LICENSE).
