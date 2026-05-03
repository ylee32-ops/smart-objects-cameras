# Dev policy

How to run, build, test, and not surprise the operator.

## No build step

The repo's `server.js` serves static files. The virtual room is served at:

```
http://localhost:4177/ideas/virtualroom/
```

When `index.html` exists in this folder, that URL renders it. Don't introduce Vite, Webpack, esbuild, or any other build tooling. If a future requirement needs one, raise it as a separate PR — don't smuggle it in.

## Module strategy

Pure ES modules served as static files. Use `<script type="module">` and an importmap.

```html
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.170.0/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.170.0/examples/jsm/"
  }
}
</script>
```

Every file in `src/` is an ESM module. Imports are relative paths within `src/` and bare `three` / `three/addons/...` for the framework.

## Dependencies

- **No new npm dependencies.** The repo runs without `node_modules` for client work.
- three.js: pinned to `0.170.0` via importmap. If you upgrade, update `docs/sim-conventions.md` (the `lookAt()` and `TransformControls.getHelper()` notes are version-sensitive).
- Fonts: Google Fonts via `<link>` for Fraunces + IBM Plex Mono + IBM Plex Sans. Acceptable for dev. Vendor before any offline classroom demo.

## Offline plan (don't implement yet, just keep door open)

When we need to run without internet:
1. Drop `three.module.js` and the addons folder into `ideas/virtualroom/vendor/three/`.
2. Update the importmap to point there.
3. Self-host the three font files in `ideas/virtualroom/vendor/fonts/`.
4. Test by disconnecting WiFi and refreshing.

Don't pre-vendor before we hit the need — adds churn.

## How to run

```powershell
npm start
```

Then open:

```
http://localhost:4177/ideas/virtualroom/
http://localhost:4177/projector.html        # to verify Phase 1b cross-page sync
http://localhost:4177/api/replay            # to verify events landed
```

No watch script. Refresh the browser after edits.

## Verification commands

| Command | When to run | Pass condition |
|---|---|---|
| `npm run preflight` | After every meaningful change | passes with 0 warnings |
| `npm run check` | Before claiming a phase done | exits clean |
| `npm run simulate:detections` | Before Phase 1b | unchanged behavior — must still post detections that update `public/projector.html` |
| Manual: drag a marker in the sim | Phase 1b acceptance | matching marker moves in `public/projector.html` within ~200 ms |

If `preflight` regresses, you broke something in `server.js` or `data/`. The virtual room is a client; it should not require server changes for Phase 1.

## Browser support

Latest Chromium (Chrome, Edge). Safari is fine. No IE, no transpilation. Use modern syntax freely (top-level await, optional chaining, etc.).

## File-serving notes

`server.js` already serves anything under the project root. `/ideas/virtualroom/index.html` will work the moment the file exists. Do not add server routes for this — keep server changes scoped to actual room logic.

## Logging policy

- `console.log` is fine for dev signals.
- `console.warn` for fallback paths (e.g., "no /api/config; using local sample data").
- `console.error` only for actual bugs in this code, not for server 4xx (those go to a status badge).
- Posted-event source field MUST be `"virtual-room"` so server logs distinguish sim from real.

## Performance budget

- Main render: 60 fps target, 30 fps floor.
- POST throttle: ≤ 12 Hz (80 ms minimum gap between fetches).
- Right-rail panels: render with the same scene; no separate WebGL renderer per panel unless needed.
- Off-screen render passes ≤ 3 per frame (POV, phone preview, phone-screen RT).

If you hit perf trouble, profile before optimizing — Three's WebGL stats panel is fine.

## What "done" looks like for any task

1. The acceptance criteria in the brief are checked.
2. `npm run preflight` still passes.
3. Manual smoke test: open the page, do the user flow described in the acceptance, see it work.
4. No unrelated diffs (don't touch `public/`, `server.js`, or `data/` unless the brief says to).
