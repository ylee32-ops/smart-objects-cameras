# Hardware Setup

The current demo should be treated as a **board-first, one-camera, one-projector** system.

Do not default back to the older two-surface table plan unless the demo explicitly needs it.

## Current Demo Stack

| Device | Role |
|---|---|
| Epson CO-FH02 or AAXA P6 Ultimate | Board projector |
| Logitech C920 family or Razer Kiyo Pro | Board camera |
| Room PC running `server.js` | Board runtime, event log, contracts, projection state |

## Do The Camera And Projector Need The Same Location?

No.

They should both aim at the same board, but they should not occupy the same point in space.

Use this rule:

- projector placement is chosen for clean image geometry and brightness
- camera placement is chosen for clean board capture and low glare

Some separation is good because it reduces:

- projector flare into the lens
- hand and head occlusion
- calibration brittleness
- mount collisions

## Board Geometry

Use this as the reference board target:

- width: `4600 mm`
- height: `2400 mm`

That matches `data/room-config.json`.

## Board Camera Placement

### Logitech C920 family

Official Logitech C920e family optical reference:

- diagonal FOV: `78°`
- horizontal FOV: `70.42°`
- vertical FOV: `43.3°`

For a `4.6 m` wide full-wall board, the camera fills the width at about:

- `3.26 m` from board

Recommended placement:

- lens height: `1.45 m` to `1.70 m`
- lens-to-board distance: start around `3.3 m` to `3.8 m`
- lateral offset: `0.3 m` to `0.6 m` from projector axis

This gives enough room for the full board and keeps the corner calibration tags inside the frame.

### Razer Kiyo Pro

Official Razer Kiyo Pro FOV modes:

- `80°`
- `90°`
- `103°`

Those are diagonal FOV values. Using a 16:9 active image, the inferred board-filling distances for a `4.6 m` wide board are:

- `80°` mode: `3.14 m`
- `90°` mode: `2.64 m`
- `103°` mode: `2.11 m`

Recommended placement:

- use `80°` or `90°`
- lens height: `1.45 m` to `1.60 m`
- lens-to-board distance: start around `3.0 m` to `3.6 m`

Use `103°` only if the room forces a very short mount distance.

## Board Projector Placement

### Epson CO-FH02

Using Epson's official projection-distance table, a `4.6 m` wide board image lands at roughly:

- wide end: `5.47 m`
- tele end: `7.41 m`

Recommended placement:

- lens height: `1.80 m` to `2.10 m`
- lens-to-board distance: start around `5.5 m` if the room allows it
- slight side offset is acceptable if you solve projector warp in software

### AAXA P6 Ultimate

Use the AAXA P6 Ultimate / HP-P6U-01 spec, not the older 600-lumen P6 entry.

Reference specs:

- native resolution: `1280x800` WXGA
- accepted input: up to `3840x2160` / 4K scaled input
- brightness: `1100 lm`
- display: `DLP`
- battery: `20000 mAh`, up to `6 hr` in eco/runtime mode
- inputs: USB-C video, HDMI, USB-A, microSD/TF
- wireless: Wi-Fi, Bluetooth, iPhone mirroring

Published throw ratio:

- `1.2`

For a `4.6 m` wide board image:

- lens-to-board distance: about `5.52 m`

Recommended placement:

- lens height: `1.80 m` to `2.00 m`
- lens-to-board distance: start around `5.5 m`

The AAXA can work for the board demo. The Epson still has more brightness headroom, but the P6 Ultimate is a better fit than the older P6 spec previously listed here.

## Projection Mapping

Yes, you want board projection mapping.

The right workflow is:

1. Physically align the projector so the board is mostly filled.
2. Use the projector's built-in geometry tools only for coarse correction.
3. Solve software warp with `projectorToSurfaceHomography`.

That software warp is where you should land:

- board writing
- focus rings
- zone rectangles
- projected labels over notes and tags

Do not rely on keystone alone if you want stable spatial overlays.

## Zone Tags

For projected zones, the simplest contract is:

- one zone tag = top-left anchor plus default size
- two zone tags = diagonal corners of the same zone

That gives you:

- a single tag for quick placement
- a second tag for resize without inventing a more complex board editor

The projector can then draw:

- a rectangular zone border
- a label
- a focus tint
- a small corner marker showing which tag is the anchor

## Calibration Order

1. Mount the board projector.
2. Mount the board camera.
3. Put board calibration tags `4,5,6,7` on the board corners.
4. Run `npm start`.
5. Run the virtual-room rehearsal first at `http://localhost:4177/ideas/virtualroom/`.
6. In the real room, solve camera-to-board calibration.
7. Then solve projector-to-board calibration.
8. Confirm that a projected focus ring lands on the same board position the camera reports.

## Virtual Room Mapping

The active Three.js sim should mirror this physical setup:

- one board camera
- one board projector
- board tags attached to the wall plane
- projected writing, focus, and zone overlays visible in the 3D scene

If the sim drifts from this hardware story, update the sim.

## Source Links

- Razer Kiyo Pro: https://www.razer.com/streaming-cameras/razer-kiyo-pro
- Razer Kiyo Pro spec block: https://www.razer.com/newsroom/product-news/show-you-mean-business-with-the-outstanding-video-quality-of-the-new-razer-kiyo-pro-webcam/
- Logitech C920e optical spec: https://hub.sync.logitech.com/c920e/post/specifications---c920e-business-webcam-TKnike7FetCzuAt
- Epson CO-FH02 projection distance: https://files.support.epson.com/docid/cpd6/cpd62252/source/setup/reference/projection_distance_cofh02.html
- Epson CO-FH02 product page: https://epson.com/For-Home/Projectors/Streaming-Entertainment/EpiqVision%C2%AE-Flex-CO-FH02-Full-HD-1080p-Smart-Portable-Projector/p/V11HA85020
- AAXA P6 Ultimate retailer/spec page: https://www.bhphotovideo.com/c/product/1776832-REG/aaxa_technologies_hp_p6u_01_p6_ultimate_1100_lumen_wxga.html
- AAXA P6 Ultimate database page: https://www.projectorcentral.com/AAXA-P6_Ultimate.htm
