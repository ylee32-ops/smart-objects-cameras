# Engineering Rules

This project should stay simple enough for students to understand and modify.

## Default Bias

- Use direct function calls before abstractions.
- Use plain objects before classes.
- Use one file before a framework.
- Use one explicit endpoint before a generic routing system.
- Use one local JSON file before a configuration system.
- Use hand-written validation before adding a schema library.

## Do Not Add

- Wrapper classes around simple functions.
- A second event bus on top of SSE.
- A plugin system.
- A project registry until the simulator proves it needs one.
- A capability router until multiple real providers exist.
- A config system with exactly one configuration.
- Backend persistence beyond the existing local state/replay files unless a workflow requires it.

## Add An Abstraction Only When

- The same logic has at least two real callers, or
- It prevents a known class of bugs, or
- It documents an important boundary students need to understand.

## Event System Rule

The event system is:

```text
POST /api/action -> pushEvent() -> SSE /api/events -> replay JSONL
```

Keep it that way until a concrete integration proves it is insufficient.

Allowed helpers:

- `normalizeEvent`
- `validateEvent`
- `classifyEventType`
- `filterEvents`

These are plain functions because they protect the shared event contract without creating a new framework.

## Review Checklist

Before merging a foundation branch:

- Can a student understand the control flow in one read?
- Can the feature be tested without hardware?
- Does every helper remove repeated code or prevent a real bug?
- Did we avoid speculative registries/routers/classes?
- Does `npm run preflight` pass?
