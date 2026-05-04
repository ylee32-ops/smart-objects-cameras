# Ideas Workspace

This folder is for standalone frontend/design experiments.

Rules:

- Do not break the working prototype in `public/`.
- Use static HTML/CSS/JS unless a design needs server state.
- Explore one visual or interaction idea per page.
- Keep the design serious, elegant, and magical.
- Dashboard views are for operators only; audience-facing views should feel invisible.

Suggested pages:

| Page | Purpose |
| --- | --- |
| `light-lab-stage.html` | Pure projector/stage concept for Light Lab. |
| `phone-lens.html` | Phone companion as lens/wand/target controller. |
| `reveal-overlay.html` | Elegant debug/reveal layer for tags, calibration, rays, and confidence. |
| `marker-card-system.html` | Visual system for printable marker cards. |
| `board-notes.html` | Semantic whiteboard sticky-note and drawing concept. |

When a direction works, move it into `public/` deliberately.

## Virtual Room

`virtual-room.html` is a read-only prototype/reference.

Planning for a clean implementation lives in:

```text
ideas/virtualroom/
```

Do not fork the big HTML directly. Cherry-pick ideas into a server-compatible implementation.
