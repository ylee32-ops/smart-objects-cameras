# Classroom API Replacement Notes

`classroom-api/` is now the replacement runtime.

The old FastAPI service has been removed from this folder. The current Node room server owns the useful classroom surfaces:

- detector/OAK pushes at `POST /push/state`
- student heartbeats at `POST /api/projects/{id}/heartbeat`
- project events at `POST /api/projects/{id}/events`
- compatibility SSE at `GET /subscribe/events?subscriber_id={id}`
- project packets and prompts from `public/project-packets.json`
- readiness scoring at `/report.html` and `/api/projects/readiness`
- class run-of-show at `/timeline.html`

Port `4177` is the classroom API port.

Use `README.md` in this folder as the source of truth for co-professor and student setup.
