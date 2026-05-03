# Smart Classroom Bus Student Guide

The classroom bus is now the Node room server in `classroom-api/`.

Start it on the room computer:

```powershell
cd classroom-api
npm start
```

Open:

```text
http://localhost:4177
```

If you are on another laptop or Raspberry Pi, use the room computer IP:

```text
http://ROOM_PC_IP:4177
```

## What You Need To Prove

Your project needs one working loop:

1. Your project sends a heartbeat.
2. Your project listens for at least one room event.
3. Your project emits at least one event back.
4. The event appears in `/report.html` or `/events.html`.

Hardware can fail. A mock event still counts as evidence if it uses your contract event names.

## Find Your Project

Open:

```text
http://ROOM_PC_IP:4177/projects.html
```

Then open your packet. Example:

```text
http://ROOM_PC_IP:4177/project.html?id=smart-stage
```

The packet shows:

- your project ID
- what you listen for
- what you emit
- a mock live test
- a prompt you can paste into Codex or Claude

## No-Code Check-In

Open:

```text
http://ROOM_PC_IP:4177/heartbeat
```

Enter your project ID, load your contract, send a heartbeat, then send one mock event.

Keep the loop running during critique so your row shows as live.

## Python Check-In

```powershell
cd classroom-api
$env:CLASSROOM_API="http://ROOM_PC_IP:4177"
$env:PROJECT_ID="YOUR_PROJECT_ID"
$env:CAPABILITIES="event.you.emit"
$env:CONSUMES="event.you.listen.for"
$env:EMITS="event.you.emit"
python student_heartbeat.py
```

## Emit One Event

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri "http://ROOM_PC_IP:4177/api/projects/YOUR_PROJECT_ID/events" `
  -ContentType "application/json" `
  -Body '{"event_type":"your.event","payload":{"mock":true}}'
```

Use the exact event names from your packet.

## Listen For Events

Your project can listen with SSE:

```text
GET /subscribe/events?subscriber_id=YOUR_PROJECT_ID
```

Broadcast events go to everyone. Directed events go only to the matching `subscriber_id`.

## Verify

Open:

```text
http://ROOM_PC_IP:4177/report.html
http://ROOM_PC_IP:4177/events.html
```

You are done when your row shows:

- heartbeat received
- at least one event
- live if your heartbeat is still running

## Timeline Demo

The professor can run the demo from:

```text
http://ROOM_PC_IP:4177/timeline.html
```

Timeline cues can fire events for student projects. If a real project is not working, use the project packet or heartbeat page to fire the same event manually.
