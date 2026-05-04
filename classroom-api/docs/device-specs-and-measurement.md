# Device Specs And Measurement

This repo no longer treats the board camera/projector pair as pure placeholders.

The current reference numbers in `data/device-specs.json` are based on manufacturer specs for:

- Razer Kiyo Pro
- Logitech C920 family (using Logitech's official C920e optical spec as the closest published family reference)
- Epson CO-FH02
- AAXA P6 Ultimate

## Current Board Target

For planning and calibration, the board target is:

- width: `4600 mm`
- height: `2400 mm`

That matches `data/room-config.json`.

## Camera Coverage

### Logitech C920 family

Official C920e FOV values from Logitech:

- diagonal: `78°`
- horizontal: `70.42°`
- vertical: `43.3°`

Derived board coverage for a `4.6 m` wide full-wall board:

- board-filling horizontal distance: about `3.26 m`
- board-filling vertical distance for `2.4 m` height: about `3.02 m`

Practical placement:

- start at `3.3 m` to `3.8 m` from the board
- mount around `1.45 m` to `1.70 m` lens height
- keep a small lateral offset so the projector beam is not centered through the camera

### Razer Kiyo Pro

Official Razer FOV modes:

- `80°`
- `90°`
- `103°`

Razer publishes these as diagonal FOV options. Horizontal and vertical values in `data/device-specs.json` are inferred assuming a `16:9` active image.

For a `4.6 m` wide board, approximate board-filling distances are:

- `80°` mode: about `3.14 m`
- `90°` mode: about `2.64 m`
- `103°` mode: about `2.11 m`

Practical placement:

- prefer `80°` or `90°` for board work
- start around `3.0 m` to `3.6 m` from the board
- use `103°` only if you truly need the extra width

## Projector Distance

### Epson CO-FH02

Epson's projection-distance table gives:

- `100 in` 16:9 image: `104 in` to `141 in` lens-to-screen

Scaled to a `4.6 m` wide board image, that is roughly:

- wide end: `5.47 m`
- tele end: `7.41 m`

Practical placement:

- start around `5.5 m` lens-to-board if the room allows it
- use the projector's coarse geometry tools first
- then solve software warp using `projectorToSurfaceHomography`

### AAXA P6 Ultimate

The current compact projector candidate is the AAXA P6 Ultimate / HP-P6U-01, not the older 600-lumen P6.

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

This is a useful compact board projector. It is brighter than the older P6 entry in this repo, but the Epson still has more brightness headroom.

## Same Location?

No. The board camera and board projector do not need to be in the same location, and they usually should not be.

Recommended rule:

- projector: place for the cleanest board throw
- camera: place for the cleanest board capture

They should both aim near the board center, but some separation is helpful because it reduces:

- projector flare into the lens
- hand/arm occlusion
- mount collisions
- calibration fragility

## Projection Mapping

Yes, for the whiteboard you want projector mapping.

There are two layers:

1. Physical coarse alignment
2. Software fine warp

The coarse alignment gets the projected image roughly square on the board.

The fine warp should use `projectorToSurfaceHomography` so the rendered content lands on the intended board coordinates even if the projector is not perfectly perpendicular.

That is the right place to handle:

- board quad correction
- corner drift
- small stand shifts between sessions
- zone boundaries and focus overlays landing in the right place

## What Is Still Not Exact

These still require on-site measurement, not just manufacturer specs:

- active camera crop mode actually selected in software
- lens distortion/intrinsics
- exact board mount height and lateral offset
- real projector lens offset in your mount
- exact board quad in the room

## Source Links

- Razer Kiyo Pro: https://www.razer.com/streaming-cameras/razer-kiyo-pro
- Razer Kiyo Pro announcement/spec block: https://www.razer.com/newsroom/product-news/show-you-mean-business-with-the-outstanding-video-quality-of-the-new-razer-kiyo-pro-webcam/
- Logitech C920e published optical spec: https://hub.sync.logitech.com/c920e/post/specifications---c920e-business-webcam-TKnike7FetCzuAt
- Epson CO-FH02 distance table: https://files.support.epson.com/docid/cpd6/cpd62252/source/setup/reference/projection_distance_cofh02.html
- Epson CO-FH02 product page: https://epson.com/For-Home/Projectors/Streaming-Entertainment/EpiqVision%C2%AE-Flex-CO-FH02-Full-HD-1080p-Smart-Portable-Projector/p/V11HA85020
- AAXA P6 Ultimate retailer/spec page: https://www.bhphotovideo.com/c/product/1776832-REG/aaxa_technologies_hp_p6u_01_p6_ultimate_1100_lumen_wxga.html
- AAXA P6 Ultimate database page: https://www.projectorcentral.com/AAXA-P6_Ultimate.htm
