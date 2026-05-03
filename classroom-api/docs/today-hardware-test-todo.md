# Today Hardware Test Todo

Goal for today:

```text
Printed AprilTag moves in camera view -> server receives it -> board/projector reacts.
```

Keep the test board-first: one camera, one projector, one room server.

## 1. Print / Prep

- [ ] Print board tag sheet: `http://localhost:4177/generated-tags/board-tags.html`
- [ ] Print all tag sheet if needed: `http://localhost:4177/generated-tags/cards.html`
- [ ] Confirm tag IDs are readable by humans after printing.
- [ ] Keep AprilTag squares flat, high contrast, and uncropped.
- [ ] Bring spare tape or magnets.
- [ ] Bring scissors or a paper cutter.
- [ ] Bring dark marker / pen for labels or notes.
- [ ] Bring extension cord and power strip.
- [ ] Bring HDMI / USB-C display adapters.
- [ ] Bring USB cable or hub for the main camera.
- [ ] Bring phone charger.
- [ ] Bring laptop charger.

## 2. Physical Room Setup

- [ ] Put projector on board/wall output.
- [ ] Put main camera where it can see the full board.
- [ ] Avoid projector glare directly into camera lens.
- [ ] Confirm camera is not blocked by people standing near board.
- [ ] Place board calibration tags:

```text
4 = board top-left
5 = board top-right
6 = board bottom-right
7 = board bottom-left
```

- [ ] Place one semantic test tag, preferably:

```text
40 = Figurate
39 = Action / Send
36 = Slide Summary
23 = Focus Beam
```

## 3. Start Software

- [ ] Start server with HTTPS:

```powershell
.\scripts\start-room.ps1 -Port 4177 -Https -HttpsPort 4178
```

- [ ] Open projector:

```text
http://localhost:4177/projector.html?map=1
```

- [ ] Fullscreen projector with `F`.
- [ ] Toggle map overlay with `M` only while aligning.
- [ ] Open setup/calibration:

```text
http://localhost:4177/setup.html
```

- [ ] Open events/debug:

```text
http://localhost:4177/events.html
```

- [ ] Open phone only for context/Figurate:

```text
https://ROOM_PC_IP:4178/phone.html
```

## 4. Network / Phone

- [ ] Confirm room PC IP with `ipconfig`.
- [ ] Confirm phone is on same WiFi, not cellular.
- [ ] Try phone HTTP fallback first if HTTPS fails:

```text
http://ROOM_PC_IP:4177/phone.html
```

- [ ] If phone cannot load either URL, add firewall rule from Administrator PowerShell:

```powershell
netsh advfirewall firewall add rule name="Smart Classroom Room Server 4177-4178" dir=in action=allow protocol=TCP localport=4177-4178
```

- [ ] If phone camera needs HTTPS trust, install:

```text
http://ROOM_PC_IP:4177/smart-room-dev.cer
```

## 5. Main Camera / Detector

- [ ] Plug in the main camera.
- [ ] Close apps that may own the camera.
- [ ] Confirm Windows privacy setting allows desktop apps to use camera.
- [ ] Run detector dry run:

```powershell
.\scripts\run-detector.ps1 -Url http://localhost:4177 -Surface board -Camera 0 -Display
```

- [ ] If camera `0` fails, try:

```powershell
.\scripts\run-detector.ps1 -Url http://localhost:4177 -Surface board -Camera 1 -Display
.\scripts\run-detector.ps1 -Url http://localhost:4177 -Surface board -Camera 2 -Display
```

- [ ] Confirm detector window outlines tags.
- [ ] Confirm events page shows `fiducial.raw.detected`.
- [ ] Confirm semantic tags become room markers.

## 6. Calibration

- [ ] Confirm setup page sees tags `4,5,6,7`.
- [ ] If needed, clear board calibration.
- [ ] Add/solve board camera calibration from visible corner tags.
- [ ] Confirm `/api/calibration` says board is `calibrated`.
- [ ] Move a semantic tag and confirm normalized board position changes.
- [ ] Keep calibration tags fixed after solving.

Useful checks:

```text
http://localhost:4177/api/calibration
http://localhost:4177/api/detections?surface=board&sourceSpace=camera
http://localhost:4177/api/events/recent?limit=20
```

## 7. Projector / Interaction Check

- [ ] Confirm projector output is visible and fullscreen.
- [ ] Confirm projected board overlay lines up enough for test.
- [ ] Move one semantic tag and verify projector reacts.
- [ ] Test one simple outcome:

```text
Focus tag -> focus/highlight appears
Action tag -> action event appears
Figurate tag -> phone Talk/Look has target context
Slide tag -> slide/control event appears
```

- [ ] Do not tune perfect projection mapping until the detection loop works.

## 8. Fallbacks

- [ ] If real camera fails, use simulated detections:

```powershell
npm run simulate:detections
```

- [ ] If phone HTTPS fails, use phone as visual-only or skip it.
- [ ] If projector alignment is bad, use projector map/status overlay only for proof.
- [ ] If calibration is unstable, demo raw tag detection plus event stream first.
- [ ] If Figurate is not configured, use local fallback and focus on tag loop.

## 9. End / Cleanup

- [ ] Stop detector window.
- [ ] Export or save useful logs if needed:

```text
http://localhost:4177/api/export
```

- [ ] Stop room server:

```powershell
.\scripts\stop-room.ps1 -Port 4177
```

- [ ] Note which camera index worked.
- [ ] Note which tags were reliable or unreliable.
- [ ] Note room distances: camera-to-board and projector-to-board.

