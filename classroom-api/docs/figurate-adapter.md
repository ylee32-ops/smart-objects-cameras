# Figurate Adapter

The room server can run in two modes:

- Local fallback: no credentials required. Phone Look and Ask still work, but responses are deterministic room-context text.
- Figurate/FlowState: the room calls FlowState's canonical text pipeline and optional vision analyzer.

## One-Line Start

Replace the values, then run from this repo:

```powershell
.\scripts\start-room.ps1 -FigurateBaseUrl "http://localhost:3000" -FigurateApiKey "fg_dev_REPLACE_ME" -FigurateCharacterId "CHARACTER_ID_REPLACE_ME"
```

If the server is already running, restart it first so the environment reaches the Node process:

```powershell
.\scripts\stop-room.ps1
.\scripts\start-room.ps1 -FigurateBaseUrl "http://localhost:3000" -FigurateApiKey "fg_dev_REPLACE_ME" -FigurateCharacterId "CHARACTER_ID_REPLACE_ME"
```

## What It Calls

- Text/character: `POST {FIGURATE_BASE_URL}/api/voice/pipeline/text`
- Vision/image: `POST {FIGURATE_BASE_URL}/api/vision/analyze`
- Local status: `GET http://localhost:4177/api/figurate/status`

The room sends:

- `characterId`
- user text or phone prompt
- room context
- latest target
- saved capture metadata
- optional phone camera image for vision analysis

The server stores phone frames locally under `public/captures/vision/` and passes the base64 frame to FlowState vision when available.

## Environment Variables

```powershell
$env:FIGURATE_BASE_URL = "http://localhost:3000"
$env:FIGURATE_API_KEY = "fg_dev_REPLACE_ME"
$env:FIGURATE_CHARACTER_ID = "CHARACTER_ID_REPLACE_ME"
$env:FIGURATE_USE_VISION = "true"
$env:FIGURATE_SKIP_TTS = "true"
npm start
```

Optional:

- `FIGURATE_TEXT_ENDPOINT`: defaults to `/api/voice/pipeline/text`.
- `FIGURATE_VISION_ENDPOINT`: defaults to `/api/vision/analyze`.
- `FIGURATE_VISION_API_KEY`: use if FlowState vision has a separate `X-Vision-API-Key`.
- `FIGURATE_TIMEOUT_MS`: defaults to `8000`.
- `FIGURATE_MODE=mock`: forces local fallback.
- `FIGURATE_ENABLE_TOOLS=true`: lets the FlowState pipeline use tools if that character supports them.

## Test Tomorrow

1. Open `http://localhost:4177/api/figurate/status` and confirm `configured: true`.
2. Open `http://localhost:4177/phone.html`.
3. Select or tap the board target.
4. Tap `Look`.
5. Confirm the phone response reports `Figurate connected` in Target tools.

If FlowState is down or credentials are missing, the room falls back locally instead of breaking the demo.
