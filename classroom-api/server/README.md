# Server Debug Map

Start here when the room server acts strange.

- `../server.js` starts the server. It should stay tiny.
- `app.js` owns the room state, actions, calibration, camera ingestion, replay, and Figurate adapter.
- `routes.js` maps URLs to behavior. If an endpoint returns the wrong thing, start here.
- `http-utils.js` handles request bodies plus JSON/text responses.
- `static-files.js` serves `public/`, `ideas/`, and the local Three.js runtime.

Common paths:

- Health check: `GET /api/health` in `routes.js`.
- Physical detector input: `POST /api/action` with `fiducial.detected` or `fiducial.batch`.
- Camera/OAK state input: `POST /push/state` or `POST /api/push/state`.
- Projector, board, phone, and setup pages: static files served through `static-files.js`.
