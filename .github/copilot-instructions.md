# Copilot instructions for acedia

- Goal: make safe, incremental code changes to a small Express.js admin app that orchestrates Pure Storage (FlashArray) and vSphere operations and stores lightweight state in SQLite.

- Big picture
  - Entry point: `server.js` (Express app). Routes live in `routes/` and render EJS views in `views/`.
  - Config: `config/database.js` (SQLite `data/users.db`), `config/session.js` (express-session). Environment files live at repo root: `ini.env`, `jkt.env`, `sby.env`. During a user session the app loads the selected environment file dynamically (see `server.js` middleware).
  - Services: `services/flashArray.js` integrates with Pure Storage REST API using environment variables (PURE_STORAGE_IP, PURE_STORAGE_USERNAME, PURE_STORAGE_PASSWORD, PURE_STORAGE_HOSTGROUP). `services/vsphereFunctions.js` and `routes/vsphere.js` integrate with vSphere (module `vsphereopsmodule` handles heavy ops).
  - Data flows: user logs in (routes/auth.js) -> chooses environment -> dashboard (`routes/dashboard.js`) fetches FlashArray snapshot lists then renders EJS. Restore flow: `routes/protection.js` calls `services/flashArray.js` restore/connect APIs, then inserts records into SQLite table `restored_volumes`.

- Key files to reference when editing behavior
  - `server.js` — app boot, dynamic env loading per session, static assets, middleware order matters.
  - `config/database.js` — SQLite schema and file path logic (packaged vs dev). New DB columns/tables must be created here or via migrations.
  - `routes/protection.js` — CSV import, restore snapshot flow, DB writes for `restored_volumes`, and `reload-restored-volumes` which polls Pure Storage for current state.
  - `services/flashArray.js` — HTTP calls to Pure Storage API, token exchange, and error handling patterns returned as `{ error: '...' }` on failure.
  - `routes/vsphere.js` and `vsphereopsmodule` — vSphere orchestration endpoints; heavy operations are in `vsphereopsmodule` (treat as blackbox unless changing workflow sequencing).

- Environment and secrets
  - The app expects env files like `ini.env`, `jkt.env`, `sby.env`. `server.js` loads the selected file path `./${req.session.environment}.env` at runtime. Do not hardcode credentials; prefer using these env files for local development.
  - Required env vars referenced across services: `PURE_STORAGE_IP`, `PURE_STORAGE_USERNAME`, `PURE_STORAGE_PASSWORD`, `PURE_STORAGE_HOSTGROUP`, `VCENTER_IP` (used for vSphere). Many calls disable TLS verification via `NODE_TLS_REJECT_UNAUTHORIZED = '0'` — keep this in mind for security-sensitive changes.

- Conventions & patterns
  - Error pattern: services often return `{ error: 'message' }` instead of throwing. Route handlers check `if (result.error) return res.status(500).json({ error: result.error })` — preserve this pattern when refactoring.
  - DB usage: code uses `sqlite3` callbacks and occasional `Promise` wrappers. Keep changes minimal and consistent (prefer async/await + Promise wrappers if changing a whole function).
  - Auto-generation: `routes/protection.js` auto-generates `newVolumeName` when missing using snapshot tail + timestamp — preserve format when modifying restore UX.
  - Session-driven env: session holds `environment` key (values: `jkt`, `sby`, `ini`) and is used to load env files dynamically. This is how the same server targets multiple remote systems.

- Developer workflows (how to run & debug)
  - No root `package.json` detected. Run with Node directly from repo root where `server.js` lives:

```powershell
# from c:\acedia\src
node server.js
```

  - Server prints debug lines on env and API calls. To emulate a specific environment, set `req.session.environment` by logging in and selecting the environment via `/choose-environment`, or set `ENV` variables in your shell and run `node server.js` for quick tests.
  - Database: `data/users.db` and `config/vsphere.db` are created/used by the app. Back these up before making schema changes.

- Safety and testing tips for AI edits
  - Avoid changing `NODE_TLS_REJECT_UNAUTHORIZED` usage or global side-effects unless adding configurable opt-in. This affects all HTTPS calls.
  - When touching restore/connect flows, keep the sequence: 1) restore snapshot -> 2) connect to host group -> 3) extract LUN/serial -> 4) insert into DB. Tests: you can stub `services/flashArray.js` methods to return expected shapes when running unit tests.
  - Use existing error-return shapes `{ error: '...' }` so callers in routes continue to work.

- Quick examples for common tasks
  - Add a new route that needs DB access: require `const db = require('../config/database');` and follow callback or Promise wrapper style used in `routes/protection.js`.
  - To read snapshots for a protection group: call `fetchProtectionGroupDataSnapshot(groupName)` (defined inside `routes/protection.js`) or use `services/flashArray.js` tokens + GET `/api/2.17/volume-snapshots?names=`.

- When in doubt
  - Follow existing patterns in `routes/protection.js` and `services/flashArray.js` for API interaction and DB updates.
  - If a change affects remote systems (Pure Storage or vSphere), document the required environment variables and recommend adding a feature flag or ENV toggle before rollout.

Please review this draft and point out any missing operational details (tests, scripts, or deploy steps) or internal workflows you want emphasized.