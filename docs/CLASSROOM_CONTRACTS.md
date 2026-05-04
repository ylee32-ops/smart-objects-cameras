# Smart Classroom Contracts

> **This document has moved.** The contract layer is now owned by the Node room server in [`classroom-api/`](../classroom-api/README.md).

The previous version of this file documented a FastAPI + Supabase service that has been retired. The current sources of truth are:

- [`classroom-api/README.md`](../classroom-api/README.md) — start here. Pages, endpoints, project loop, OAK-D compatibility shape.
- [`classroom-api/docs/event-contract.md`](../classroom-api/docs/event-contract.md) — event envelope and per-project contracts.
- [`classroom-api/docs/board-coordinate-contract.md`](../classroom-api/docs/board-coordinate-contract.md) — board surface coordinate system.
- [`classroom-api/public/project-packets.json`](../classroom-api/public/project-packets.json) — project roster, capabilities, and acceptance criteria.
- [`classroom-api/public/session-timeline.json`](../classroom-api/public/session-timeline.json) — run-of-show timeline cues.

Run the room server:

```powershell
cd classroom-api
npm start
```

Open `http://localhost:4177`. The old `:8766` FastAPI service has been removed.
