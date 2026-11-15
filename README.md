# Goalify Companion

Goalify Companion is a standalone, opt-in desktop app for Goalify on WoW Forever. After logout or `/reload`, it reads `Goalify.lua` from a chosen World of Warcraft folder. It does not modify game files or play the game. It requires both Goalify's in-game Community Sharing setting and separate consent for each account.

## Use

Install and launch the app. Choose the World of Warcraft or `_forever_` folder if detection fails. Review the masked account, enable Community Sharing in Goalify, refresh after logout or `/reload`, click Preview, inspect the exact JSON, tick consent, and click Send. Data is uploaded only on that action; automatic 30-minute syncing is optional, off by default, and requires a prior reviewed manual send for each account. Stop sharing pauses all uploads. Revoke account consent to discard its pending retry. Account folder names never leave the computer.

A failed attempted upload is retained for explicit retry with the same batch ID, is visible as pending, and is retried automatically only if automatic sync has been enabled. A successful response advances the account's watermark. Large datasets are divided into multiple batches; preview and send each remaining batch (or allow automatic sync to send them). A rejected-record count is shown if the service skips records. A timestamp shared across batches is handled without skipping other observations at that timestamp.

## Privacy and deletion

Only the previewed NPC and item identifiers and names, observations, approximate locations, timestamps, client build, addon version and locale are sent. Character, realm and account names, GUIDs, goals, gold, inventory, mail and notes are never extracted. The optional credit name is sent separately and only when saved. The anonymous install token is encrypted using Electron safeStorage; configuration, consent, retry payloads and watermarks are held in the app's local user data directory. Disable sharing in either place to prevent uploads. Delete my shared data asks the service to delete this install and its observations, then removes the local credentials, pending batches, watermarks and consent. Deletion requires connectivity and the original token.

[Privacy policy](https://goalify.griffify.com/privacy-policy.html)

## Development and packaging

Requires Node.js and npm. `npm ci`, `npm test`, `npm start`, or `npx electron-builder --win --x64` (unsigned local NSIS build). macOS DMG is configured but must be built and tested on macOS. Generated output is under `dist/` and is ignored by Git. Do not publish the unsigned build.

The production API URL in `lib/config.js` is a **placeholder** until the host is confirmed. The API contract is the Goalify v1 draft. For local development only, `GOALIFY_API_BASE` may override it; HTTP is accepted only for localhost/127.0.0.1, and HTTPS only for localhost or the configured production host. No API connection is needed to preview data.
