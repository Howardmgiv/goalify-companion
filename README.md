# Goalify Companion

Goalify Companion is a standalone, opt-in desktop app for Goalify on WoW Forever. After logout or `/reload`, it reads `Goalify.lua` from a chosen World of Warcraft folder. It does not modify game files or play the game. It requires both Goalify's in-game Community Sharing setting and separate consent for each account.

## Download

Get the Windows installer from [Releases](https://github.com/Howardmgiv/goalify-companion/releases) or [goalify.griffify.com](https://goalify.griffify.com/#companion). Builds are not code-signed yet, so Windows SmartScreen may warn you. Before running it, compare the file hash with the SHA-256 in the release notes: `Get-FileHash .\Goalify-Companion-Setup-0.1.0.exe -Algorithm SHA256`. You can also build it yourself from this source (see below).

## Use

Install and launch the app. Choose the World of Warcraft or `_forever_` folder if detection fails. Review the masked account, enable Community Sharing in Goalify, refresh after logout or `/reload`, click Preview, inspect the exact JSON, tick consent, and click Send. Data is uploaded only on that action; there is no automatic sync, so every batch is previewed first. Any text matching one of the account's own character or realm names is removed before the preview. Stop sharing pauses all uploads. Revoke account consent to discard its pending retry. Account folder names never leave the computer.

A failed attempted upload is retained for explicit retry with the same batch ID, is visible as pending, and is retried only when you preview and send it again. A successful response advances the account's watermark. Large datasets are divided into multiple batches; preview and send each remaining batch. A rejected-record count is shown if the service skips records. A timestamp shared across batches is handled without skipping other observations at that timestamp.

## Privacy and deletion

Only the previewed NPC and item identifiers and names, observations, approximate locations, timestamps, client build, addon version and locale are sent. Character, realm and account names, GUIDs, goals, gold, inventory, mail and notes are never extracted. The optional credit name is sent separately and only when saved. The anonymous install token is encrypted using Electron safeStorage; configuration, consent, retry payloads and watermarks are held in the app's local user data directory. Disable sharing in either place to prevent uploads. Delete my shared data asks the service to delete this install and its observations, then removes the local credentials, pending batches, watermarks and consent. Deletion requires connectivity and the original token.

[Privacy policy](https://goalify.griffify.com/privacy-policy.html)

## Development and packaging

Requires Node.js and npm. `npm ci`, `npm test`, `npm start`, or `npx electron-builder --win --x64` (unsigned local NSIS build). macOS DMG is configured but must be built and tested on macOS. Generated output is under `dist/` and is ignored by Git. Releases are unsigned until a code-signing certificate is added; every release lists the installer's SHA-256 and the commit it was built from.

The production API is `https://goalify.griffify.com/api/v1` (set in `lib/config.js`); its contract is documented in the goalify-site repository (`api/API.md`). Shared sources are published only after the Goalify admin reviews them. For local development only, `GOALIFY_API_BASE` may override it; HTTP is accepted only for localhost/127.0.0.1, and HTTPS only for localhost or the configured production host. No API connection is needed to preview data.

## License

Source-available: you may read, audit and build this code for personal verification, but not copy, modify or redistribute it. See [LICENSE](LICENSE).
