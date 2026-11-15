# Security and privacy

## Threat model

SavedVariables are untrusted local data, the renderer is less trusted than the main process, and the network/service may be offline, malicious or compromised. A local attacker who can modify the app, configuration or game files as the same user is outside the isolation boundary. Sharing and deletion depend on the service honoring its contract. Do not ship with the placeholder API host without confirming it and independently reviewing/testing the service.

## Mitigations

The hand-written parser never executes Lua, uses null-prototype tables and enforces 32 MiB, 64 levels, 2 million values and 64 KiB strings. The extractor explicitly constructs an allowlisted payload, validates fields and limits locations, batch bytes and records. Account identity is represented locally by a hash; only a masked label reaches the renderer. The native directory picker controls the root; files must resolve to `Goalify.lua` inside a discovered account's `SavedVariables` under that root. Symlinked account, SavedVariables and file entries are rejected. There remains a local filesystem time-of-check/time-of-use race if another local process replaces path components during a read.

Electron uses a sandboxed renderer, context isolation, no Node integration, web security, a restrictive CSP, denied navigation/windows, a narrow validated IPC API and disabled packaged devtools. External browsing is restricted to HTTPS on goalify.griffify.com. API requests use Electron networking, a fixed HTTPS production host, no redirects, 15-second timeout, bounded response streaming and strict JSON. A development override is limited to the configured HTTPS host or localhost; only localhost allows HTTP. The install token is encrypted with safeStorage and never intentionally logged or exposed to the renderer. If secure storage is unavailable, registration and sharing are disabled. Config is written in the user data directory.

Sharing requires in-game opt-in, per-account consent and a reviewed initial manual send. Pending failed batches are shown and preserve their ID for idempotent retry; automatic sync is opt-in. The stop switch pauses all uploads; the deletion action requires a successful server response before local credentials are wiped. The upload host is currently a placeholder, and the backend and deletion behavior have not been independently verified by this client build. Unsigned artifacts do not provide publisher authentication.

Report security problems privately to the project maintainer; do not post secrets or SavedVariables publicly.
