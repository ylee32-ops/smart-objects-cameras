"use strict";

const video = document.getElementById("cameraVideo");
const lensScreen = document.getElementById("phoneLensScreen");
const phoneClock = document.getElementById("phoneClock");
const phoneLensMode = document.getElementById("phoneLensMode");
const phoneAnnotLabel = document.getElementById("phoneAnnotLabel");
const phoneAnnotConf = document.getElementById("phoneAnnotConf");
const phoneTargetDelta = document.getElementById("phoneTargetDelta");
const phoneVisionStatus = document.getElementById("phoneVisionStatus");
const scannerStatus = document.getElementById("scannerStatus");
const cameraState = document.getElementById("cameraState");
const captureVisionButton = document.getElementById("captureVision");
const startCameraButton = document.getElementById("startCamera");
const stopCameraButton = document.getElementById("stopCamera");
const toggleLiveConversationButton = document.getElementById("toggleLiveConversation");

let target = null;
let mediaStream = null;
let liveConversation = null;

Room.connect();
Room.initIdentity("phone");

startCameraButton.addEventListener("click", startCamera);
stopCameraButton.addEventListener("click", stopCamera);
captureVisionButton.addEventListener("click", () => captureVision().catch(alertError));
toggleLiveConversationButton.addEventListener("click", () => toggleLiveConversation().catch(alertError));
lensScreen.addEventListener("click", handleLensTap);

Room.onState((state) => {
  target = state.phone?.target || target;
  liveConversation = state.character?.conversation?.live ? state.character.conversation : null;
  renderTarget();
  renderConversation();
  renderVision(state);
});

updateClock();
setInterval(updateClock, 30000);

function renderTarget() {
  lensScreen.dataset.state = target ? "acquired" : "idle";
  const label = target?.label || target?.id || "Aim";
  const role = target?.role || target?.kind || "target";
  const surface = target?.surface || "board";
  document.getElementById("currentTarget").innerHTML = `<span>${escapeHtml(label)}</span>`;
  phoneLensMode.textContent = target ? `${role}` : "Tag scan";
  phoneAnnotLabel.textContent = target ? `${String(label).slice(0, 20)}` : "No target";
  phoneAnnotConf.textContent = target
    ? `tag ${target.tagId ?? "-"} / ${surface}`
    : mediaStream ? "camera ready" : "camera off";
  phoneTargetDelta.textContent = target ? `${role} / ${surface}` : "Main camera controls tag targeting";

  if (Number.isFinite(Number(target?.x)) && Number.isFinite(Number(target?.y))) {
    const x = Math.max(14, Math.min(86, Number(target.x) * 100));
    const y = Math.max(18, Math.min(72, Number(target.y) * 100));
    document.querySelector(".phone-target-ring").style.left = `${x}%`;
    document.querySelector(".phone-target-ring").style.top = `${y}%`;
    document.querySelector(".phone-tag-annot").style.left = `${Math.min(78, x + 11)}%`;
    document.querySelector(".phone-tag-annot").style.top = `${Math.max(12, y - 18)}%`;
  }
}

function renderVision(state) {
  const lastCapture = state.character?.vision?.lastCapture;
  if (!lastCapture) return;
  const saved = lastCapture.imagePath ? "frame saved" : "room context";
  phoneVisionStatus.textContent = `${saved}: ${String(lastCapture.description || "visual context ready").slice(0, 96)}`;
}

function renderConversation() {
  const live = Boolean(liveConversation?.live);
  lensScreen.dataset.live = live ? "true" : "false";
  toggleLiveConversationButton.classList.toggle("live-active", live);
  toggleLiveConversationButton.textContent = live ? "End" : "Talk";
}

async function selectTarget(nextTarget, source) {
  target = nextTarget;
  renderTarget();
  await Room.action("phone.target", { mode: "camera", target: nextTarget, source });
}

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) {
    scannerStatus.textContent = "Camera access is unavailable here. Use the HTTPS phone URL.";
    return;
  }

  if (mediaStream) return;
  mediaStream = await navigator.mediaDevices.getUserMedia({
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1280 },
      height: { ideal: 720 },
    },
    audio: false,
  });
  video.srcObject = mediaStream;
  await video.play();
  lensScreen.classList.add("has-camera");
  cameraState.textContent = "ON";
  phoneVisionStatus.textContent = "Camera on. Press Look to send this view, or Talk for Figurate.";
  scannerStatus.textContent = "Main camera handles AprilTags. Phone camera is for context.";
}

function stopCamera() {
  if (mediaStream) {
    mediaStream.getTracks().forEach((track) => track.stop());
    mediaStream = null;
  }
  video.srcObject = null;
  lensScreen.classList.remove("has-camera");
  cameraState.textContent = "OFF";
  scannerStatus.textContent = "Camera stopped.";
}

function captureFrame(maxWidth = 960, quality = 0.72) {
  if (!mediaStream || !video.videoWidth || !video.videoHeight || video.readyState < 2) return null;
  const scale = Math.min(1, maxWidth / video.videoWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
  const context = canvas.getContext("2d");
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    imageDataUrl: canvas.toDataURL("image/jpeg", quality),
    width: canvas.width,
    height: canvas.height,
  };
}

async function captureVision(promptOverride) {
  const prompt = String(promptOverride || document.getElementById("phoneAsk").value || "What do you see?").slice(0, 500);
  const frame = captureFrame();
  phoneVisionStatus.textContent = frame
    ? "Sending camera frame..."
    : "Sending current room context...";
  const result = await Room.action("phone.vision.capture", {
    target,
    prompt,
    imageDataUrl: frame?.imageDataUrl || null,
    captureKind: frame ? "phone-camera-frame" : "phone-context",
  });
  phoneVisionStatus.textContent = String(result.response || "Visual context ready.").slice(0, 120);
  return result;
}

async function toggleLiveConversation() {
  if (liveConversation?.live) {
    await Room.action("phone.conversation.stop", {});
    phoneVisionStatus.textContent = "Talk closed.";
    return;
  }
  await Room.action("phone.conversation.start", {
    target,
    characterId: "figurate",
    label: "Figurate",
  });
  phoneVisionStatus.textContent = "Talk open. Look refreshes the target context.";
}

function handleLensTap(event) {
  if (event.target.closest("button, input, textarea, select, summary, details, a")) return;
  phoneVisionStatus.textContent = target
    ? `${target.label || target.id} is selected. Press Look or Talk.`
    : "No target selected yet. Main camera will provide tag targeting.";
}

function alertError(error) {
  alert(error.message || String(error));
}

function updateClock() {
  const date = new Date();
  phoneClock.textContent = `${date.getHours()}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
