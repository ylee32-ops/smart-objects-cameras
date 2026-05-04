"use strict";

const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "public", "data");

/* List ISO-keyed evidence files (YYYY-MM-DD.json) in /public/data.
   Used by the calendar minimap to mark days with captured data. Cheap;
   no schema validation here — just file existence + parsability check
   on each at request time. */
function listClassDayIndex() {
  let files = [];
  try { files = fs.readdirSync(DATA_DIR); }
  catch { return { days: [], generatedAt: new Date().toISOString() }; }

  const days = files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => {
      const iso = f.replace(/\.json$/, "");
      try {
        const raw = fs.readFileSync(path.join(DATA_DIR, f), "utf8");
        const data = JSON.parse(raw);
        return {
          iso,
          label: data.label || data.subtitle || iso,
          subtitle: data.subtitle || "",
          duration: data.duration || null,
          weekId: data.weekId || null,
          assignments: Array.isArray(data.assignments) ? data.assignments.length : 0,
          ideas: Array.isArray(data.ideas) ? data.ideas.length : 0,
          quotes: Array.isArray(data.quotes) ? data.quotes.length : 0,
        };
      } catch {
        return { iso, label: iso, error: "parse-failed" };
      }
    })
    .sort((a, b) => a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0);

  return { days, generatedAt: new Date().toISOString() };
}

function createRequestHandler(room) {
  const {
    bootTime,
    buildRoomContext,
    cameraSnapshot,
    capabilityIndex,
    canonicalEventType,
    classObjectConfig,
    detectTagDebugFrame,
    deviceSpecs,
    eventFiltersFromUrl,
    eventLimitFromUrl,
    figuratePublicStatus,
    filterEvents,
    getProjectPacket,
    handleAction,
    ingestCameraState,
    legacyEventClients,
    legacyStateClients,
    now,
    projectContract,
    projectContractMarkdown,
    projectEvents,
    projectReadinessSnapshot,
    publicState,
    publishProjectEvent,
    readBody,
    readReplayEvents,
    resetRoomState,
    roomConfig,
    sendCameraCommand,
    sendJson,
    sendStatic,
    sendText,
    sseClients,
    state,
    tagMap,
    projectTags,
    lanHosts,
    port,
    updateProjectHeartbeat,
    validateEvent,
    writeSse,
  } = room;

  return async function handleRequest(req, res) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  
    if (req.method === "GET" && url.pathname === "/api/state") {
      sendJson(res, 200, publicState());
      return;
    }

    /* Class-day evidence index — used by the calendar minimap. Lists
       every /public/data/<ISO>.json with its label and content counts. */
    if (req.method === "GET" && url.pathname === "/api/data/index") {
      sendJson(res, 200, listClassDayIndex());
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config") {
      sendJson(res, 200, roomConfig);
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/tag-map") {
      sendJson(res, 200, tagMap);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/project-tags") {
      sendJson(res, 200, projectTags || { assignments: {} });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/lan-host") {
      const hosts = typeof lanHosts === "function" ? lanHosts() : [];
      sendJson(res, 200, { hosts, port });
      return;
    }

    if (req.method === "GET" && url.pathname === "/console") {
      res.writeHead(302, { Location: "/" });
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/heartbeat") {
      req.url = "/heartbeat.html";
      sendStatic(req, res);
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/device-specs") {
      sendJson(res, 200, deviceSpecs);
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/calibration") {
      sendJson(res, 200, state.calibration);
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/class-objects") {
      sendJson(res, 200, {
        objects: state.classObjects,
        zones: classObjectConfig.zones || [],
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/projects/readiness" || url.pathname === "/projects/readiness")) {
      sendJson(res, 200, projectReadinessSnapshot());
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/projects/status" || url.pathname === "/projects/status")) {
      sendJson(res, 200, {
        generatedAt: now(),
        heartbeats: state.projectHeartbeats,
        readiness: projectReadinessSnapshot(),
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/capabilities" || url.pathname === "/capabilities")) {
      sendJson(res, 200, { capabilities: capabilityIndex() });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/capabilities/route" || url.pathname === "/capabilities/route")) {
      try {
        const body = await readBody(req);
        const request = body ? JSON.parse(body) : {};
        const capability = String(request.capability || "");
        const providers = capabilityIndex()[capability] || [];
        const target = providers.find((provider) => provider.live)?.projectId || providers[0]?.projectId || null;
        sendJson(res, target ? 200 : 404, {
          ok: Boolean(target),
          capability,
          target,
          providers,
          reason: request.reason || "",
          neededBy: request.needed_by || request.neededBy || null,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/contracts" || url.pathname === "/contracts")) {
      sendJson(res, 200, {
        contracts: Object.fromEntries(state.projectPackets.map((project) => [project.id, projectContract(project)])),
      });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/contracts/validate" || url.pathname === "/contracts/validate")) {
      try {
        const body = await readBody(req);
        const request = body ? JSON.parse(body) : {};
        const eventType = canonicalEventType(request.event_type || request.eventType || "");
        const event = {
          id: "evt-validate",
          event_type: eventType,
          source: String(request.source || request.project_id || request.projectId || "contract-validator"),
          target: request.target || null,
          salience: request.salience || "broadcast",
          created_at: request.created_at || now(),
          payload: request.payload && typeof request.payload === "object" ? request.payload : {},
        };
        const validation = validateEvent(event);
        sendJson(res, validation.ok ? 200 : 400, {
          ok: validation.ok,
          event_type: eventType,
          event,
          errors: validation.errors,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/room/context" || url.pathname === "/room/context")) {
      sendJson(res, 200, buildRoomContext());
      return;
    }

    const legacyCameraStateMatch = url.pathname.match(/^\/state\/([^/]+)$/);
    if (req.method === "GET" && legacyCameraStateMatch) {
      const cameraId = decodeURIComponent(legacyCameraStateMatch[1]);
      const camera = state.perception.cameraStates[cameraId];
      if (!camera) {
        sendJson(res, 404, { ok: false, error: "unknown camera" });
        return;
      }
      sendJson(res, 200, camera);
      return;
    }

    if (req.method === "GET" && url.pathname === "/state") {
      sendJson(res, 200, buildRoomContext());
      return;
    }

    if (req.method === "GET" && url.pathname === "/mode") {
      const context = buildRoomContext();
      sendJson(res, 200, {
        room_mode: context.room_mode,
        phase: context.phase,
        total_persons: context.social.total_persons,
        whiteboard_active: context.task.whiteboard_active,
        active_capabilities: context.active_capabilities,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/phase") {
      const context = buildRoomContext();
      sendJson(res, 200, {
        ok: true,
        phase: context.phase,
        room_mode: context.room_mode,
        timestamp: now(),
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/phase") {
      try {
        const body = await readBody(req);
        const request = body ? JSON.parse(body) : {};
        const phase = String(request.phase || request.session_phase || "unknown");
        const result = await handleAction({
          type: "phase.set",
          payload: { phase },
          source: "legacy-phase-api",
          user: { name: "legacy-phase-api" },
        }, req);
        const context = buildRoomContext();
        sendJson(res, result.ok ? 200 : 400, {
          ok: result.ok,
          phase: context.phase,
          room_mode: context.room_mode,
          event_type: "room.phase.changed",
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "POST" && (url.pathname === "/mock/reset" || url.pathname === "/api/mock/reset")) {
      try {
        const result = typeof resetRoomState === "function"
          ? resetRoomState("legacy-mock-reset", "legacy-mock-reset")
          : await handleAction({ type: "room.reset", source: "legacy-mock-reset", user: { name: "legacy-mock-reset" } }, req);
        const context = buildRoomContext();
        sendJson(res, result.ok ? 200 : 400, {
          ok: result.ok,
          phase: context.phase,
          room_mode: context.room_mode,
        });
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "GET" && (url.pathname === "/events" || url.pathname === "/bus/events")) {
      const limit = eventLimitFromUrl(url, 80);
      sendJson(res, 200, {
        events: filterEvents(state.events, eventFiltersFromUrl(url)).slice(0, limit),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/projects/nudges.md") {
      const readiness = projectReadinessSnapshot();
      const lines = ["# Project Nudges", ""];
      for (const project of readiness.projects) {
        const nudge = project.live
          ? "live now; keep it running"
          : project.hasHeartbeat
            ? "heartbeat is stale; restart the project"
            : "send a heartbeat, then publish one contract event";
        lines.push(`- ${project.projectId}: ${nudge}`);
      }
      sendText(res, 200, `${lines.join("\n")}\n`, "text/markdown; charset=utf-8");
      return;
    }

    if (req.method === "GET" && url.pathname === "/projects/nudges") {
      const readiness = projectReadinessSnapshot();
      sendJson(res, 200, {
        generatedAt: readiness.generatedAt,
        nudges: readiness.projects.map((project) => ({
          projectId: project.projectId,
          title: project.title,
          nudge: project.live
            ? "live now; keep it running"
            : project.hasHeartbeat
              ? "heartbeat is stale; restart the project"
              : "send a heartbeat, then publish one contract event",
        })),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/projects/roster.csv") {
      const rows = [["project_id", "title", "owner", "score", "status"]];
      for (const project of projectReadinessSnapshot().projects) {
        rows.push([project.projectId, project.title, project.owner, project.score, project.status]);
      }
      const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
      sendText(res, 200, `${csv}\n`, "text/csv; charset=utf-8");
      return;
    }

    if (req.method === "GET" && (url.pathname === "/showcase/report.json" || url.pathname === "/api/showcase/report.json")) {
      sendJson(res, 200, {
        generatedAt: now(),
        readiness: projectReadinessSnapshot(),
        recentEvents: state.events.slice(0, 80),
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/showcase/report" || url.pathname === "/api/showcase/report")) {
      const readiness = projectReadinessSnapshot();
      const lines = [
        "# Smart Classroom Showcase Report",
        "",
        `Generated: ${readiness.generatedAt}`,
        "",
        `Total projects: ${readiness.summary.total}`,
        `Live: ${readiness.summary.live}`,
        `With events: ${readiness.summary.withEvents}`,
        "",
        "| Project | Owner | Score | Status |",
        "|---|---|---:|---|",
      ];
      for (const project of readiness.projects) {
        lines.push(`| ${project.title} | ${project.owner || ""} | ${project.score}/5 | ${project.status} |`);
      }
      sendText(res, 200, `${lines.join("\n")}\n`, "text/markdown; charset=utf-8");
      return;
    }

    if (req.method === "GET" && (url.pathname === "/showcase/demo-script" || url.pathname === "/api/showcase/demo-script")) {
      const lines = [
        "# Smart Classroom Demo Script",
        "",
        "Use the browser timeline as the run-of-show:",
        "",
        `http://localhost:${port}/timeline.html`,
        "",
        "Core demo surfaces:",
        "",
        `- Dashboard: http://localhost:${port}/`,
        `- Projects: http://localhost:${port}/projects.html`,
        `- Readiness report: http://localhost:${port}/report.html`,
        `- Events: http://localhost:${port}/events.html`,
        `- Cameras: http://localhost:${port}/cameras.html`,
        `- Heartbeat page: http://localhost:${port}/heartbeat`,
        "",
        "Run the mock project loop if live student code is not ready:",
        "",
        "```powershell",
        "npm run mock:projects",
        "```",
        "",
        "Run the OAK-D rehearsal path without hardware:",
        "",
        "```powershell",
        "npm run simulate:oaks",
        "```",
      ];
      sendText(res, 200, `${lines.join("\n")}\n`, "text/markdown; charset=utf-8");
      return;
    }

    if (req.method === "GET" && url.pathname === "/projects") {
      sendJson(res, 200, {
        projects: state.projectPackets,
      });
      return;
    }

    const projectContractMatch = url.pathname.match(/^\/(?:api\/)?projects\/([^/]+)\/contract(\.md)?$/);
    if (req.method === "GET" && projectContractMatch) {
      const project = getProjectPacket(decodeURIComponent(projectContractMatch[1]));
      if (!project) {
        sendJson(res, 404, { ok: false, error: "unknown project" });
        return;
      }
      if (projectContractMatch[2]) {
        sendText(res, 200, projectContractMarkdown(project), "text/markdown; charset=utf-8");
      } else {
        sendJson(res, 200, projectContract(project));
      }
      return;
    }

    const projectPacketMarkdownMatch = url.pathname.match(/^\/projects\/([^/]+)\/packet\.md$/);
    if (req.method === "GET" && projectPacketMarkdownMatch) {
      const project = getProjectPacket(decodeURIComponent(projectPacketMarkdownMatch[1]));
      if (!project) {
        sendText(res, 404, "unknown project");
        return;
      }
      sendText(res, 200, projectContractMarkdown(project), "text/markdown; charset=utf-8");
      return;
    }

    const projectEventsMatch = url.pathname.match(/^\/(?:api\/)?projects\/([^/]+)\/events$/);
    if (req.method === "GET" && projectEventsMatch) {
      const projectId = decodeURIComponent(projectEventsMatch[1]);
      if (!getProjectPacket(projectId)) {
        sendJson(res, 404, { ok: false, error: "unknown project" });
        return;
      }
      sendJson(res, 200, { events: projectEvents(projectId, { includeSystem: true }) });
      return;
    }

    if (req.method === "POST" && projectEventsMatch) {
      try {
        const body = await readBody(req);
        const result = publishProjectEvent(decodeURIComponent(projectEventsMatch[1]), body ? JSON.parse(body) : {});
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    const projectHeartbeatMatch = url.pathname.match(/^\/(?:api\/)?projects\/([^/]+)\/heartbeat$/);
    if (req.method === "POST" && projectHeartbeatMatch) {
      try {
        const body = await readBody(req);
        const result = updateProjectHeartbeat(decodeURIComponent(projectHeartbeatMatch[1]), body ? JSON.parse(body) : {});
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      sendJson(res, 200, {
        projects: state.projectPackets,
      });
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/detections") {
      const surface = url.searchParams.get("surface");
      const sourceSpace = url.searchParams.get("sourceSpace");
      const key = surface && sourceSpace ? `${surface}:${sourceSpace}` : null;
      sendJson(res, 200, {
        rawDetections: key ? state.perception.rawDetections[key] || {} : state.perception.rawDetections,
        now: now(),
      });
      return;
    }

    if (req.method === "GET" && (url.pathname === "/api/cameras" || url.pathname === "/cameras")) {
      sendJson(res, 200, cameraSnapshot());
      return;
    }

    const cameraCommandMatch = url.pathname.match(/^\/(?:api\/)?cameras\/([^/]+)\/command$/);
    if (req.method === "POST" && cameraCommandMatch) {
      try {
        const body = await readBody(req);
        const result = sendCameraCommand(
          decodeURIComponent(cameraCommandMatch[1]),
          body ? JSON.parse(body) : {},
          "camera-command-api",
        );
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    const projectCameraRequestMatch = url.pathname.match(/^\/(?:api\/)?projects\/([^/]+)\/camera-request$/);
    if (req.method === "POST" && projectCameraRequestMatch) {
      try {
        const projectId = decodeURIComponent(projectCameraRequestMatch[1]);
        const project = getProjectPacket(projectId);
        if (!project) {
          sendJson(res, 404, { ok: false, error: "unknown project" });
          return;
        }
        const body = await readBody(req);
        const request = body ? JSON.parse(body) : {};
        const result = sendCameraCommand(request.cameraId || request.camera_id || "all-cameras", {
          ...request,
          projectId,
        }, projectId);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/replay") {
      try {
        sendJson(res, 200, {
          events: readReplayEvents(eventLimitFromUrl(url), eventFiltersFromUrl(url)),
          path: REPLAY_PATH,
        });
      } catch (error) {
        sendJson(res, 500, { ok: false, error: error.message });
      }
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/export") {
      sendJson(res, 200, {
        exportedAt: now(),
        state: publicState(),
        config: roomConfig,
        tagMap,
        deviceSpecs,
      });
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/events/recent") {
      const limit = eventLimitFromUrl(url, 80);
      sendJson(res, 200, {
        events: filterEvents(state.events, eventFiltersFromUrl(url)).slice(0, limit),
        count: state.events.length,
      });
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      res.write(`event: state\ndata: ${JSON.stringify(publicState())}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname === "/subscribe/state") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      writeSse(res, "state", buildRoomContext());
      legacyStateClients.add(res);
      req.on("close", () => legacyStateClients.delete(res));
      return;
    }

    if (req.method === "GET" && url.pathname === "/subscribe/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      const client = {
        res,
        subscriberId: url.searchParams.get("subscriber_id") || "anonymous",
        eventType: url.searchParams.get("event_type") ? canonicalEventType(url.searchParams.get("event_type")) : "",
      };
      legacyEventClients.add(client);
      req.on("close", () => legacyEventClients.delete(client));
      return;
    }

    if (req.method === "POST" && (url.pathname === "/push/state" || url.pathname === "/api/push/state")) {
      try {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        const source = payload.camera_id || payload.cameraId || "camera-worker";
        const result = ingestCameraState(payload, source);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tag-debugger/detect") {
      try {
        const body = await readBody(req);
        const payload = body ? JSON.parse(body) : {};
        const result = await detectTagDebugFrame(payload);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/action") {
      try {
        const body = await readBody(req);
        const action = body ? JSON.parse(body) : {};
        const result = await handleAction(action, req);
        sendJson(res, result.ok ? 200 : 400, result);
      } catch (error) {
        sendJson(res, 400, { ok: false, error: error.message });
      }
      return;
    }
  
    if (req.method === "GET" && url.pathname === "/api/health") {
      sendJson(res, 200, { ok: true, uptime_ms: Date.now() - bootTime });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/figurate/status") {
      sendJson(res, 200, {
        ok: true,
        uptime_ms: Date.now() - bootTime,
        figurate: figuratePublicStatus(),
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true, uptime_ms: Date.now() - bootTime });
      return;
    }
  
    if (req.method === "GET") {
      sendStatic(req, res);
      return;
    }
  
    res.writeHead(405, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Method not allowed");
  };
}

function csvCell(value) {
  const text = String(value ?? "");
  if (!/[",\r\n]/.test(text)) return text;
  return `"${text.replace(/"/g, '""')}"`;
}

module.exports = {
  createRequestHandler,
};
