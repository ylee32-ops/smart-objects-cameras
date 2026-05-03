# Virtual Room Plan

This folder is for planning a clean virtual-room implementation that works with the current smart classroom server.

The existing prototype is read-only inspiration:

```text
ideas/virtual-room.html
```

Do not fork or edit that file directly. It is a sketch/prototype. The production-compatible virtual room should be built fresh from the ideas that work.

## Goal

Build a virtual room simulator that lets us rehearse the physical setup before hardware is ready:

- table surface
- board surface
- projector output
- simulated OAK/webcam viewpoints
- phone lens viewpoint
- marker cards
- people / pointing / intent rays
- detection events posted to the existing room server

The virtual room should be a perception and calibration sandbox, not the main audience UI.

## Current Server To Integrate With

Use the existing server contracts:

```text
GET  /api/state
GET  /api/config
GET  /api/tag-map
GET  /api/calibration
GET  /api/replay
POST /api/action
```

Important actions:

```text
fiducial.detections.ingest
calibration.sample.add
calibration.solve
intent.ray.estimated       future
intent.target.resolved     future
phone.target.selected
```

## What To Cherry-Pick From The Prototype

Good ideas to keep:

- 3D room as a rehearsal environment.
- Table, board, camera, projector, and phone in one spatial scene.
- Multiple camera POV panels.
- Marker dragging on the table.
- Simulated fiducial detections from camera projections.
- Phone lens reticle and target selection.
- Whiteboard drawing/sticky-note concept.
- Inspector/debug overlay ideas.

Things to avoid copying directly:

- One giant HTML file.
- Fake tag textures that look like AprilTags but are not official.
- Commented-out server integration.
- Local role/tag maps duplicated away from `data/room-config.json`.
- Detection payloads that do not match the server contract.
- Dashboard-heavy right rail as a final UI.

## Fresh Implementation Shape

Build this as small modules later:

```text
ideas/virtualroom/
  README.md
  implementation-plan.md
  contract-map.md
  index.html              future
  virtual-room.css        future
  src/
    app.js
    room-scene.js
    markers.js
    cameras.js
    detections.js
    phone-lens.js
    server-client.js
```

Keep it standalone until it proves value. Then integrate selected pieces into `public/`.

