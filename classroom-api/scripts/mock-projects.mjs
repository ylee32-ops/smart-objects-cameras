#!/usr/bin/env node
// Activate every submitted student project one at a time so the
// landing page can show readiness climbing live. After all are active,
// heartbeats are kept fresh in a loop. Ctrl-C to stop.
//
// Usage:
//   node scripts/mock-projects.mjs
//   URL=http://192.168.2.10:4177 node scripts/mock-projects.mjs
//   STAGGER_MS=2000 node scripts/mock-projects.mjs

import fs from 'node:fs';
import path from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..');

const URL = process.env.URL || 'http://localhost:4177';
const STAGGER_MS = Number(process.env.STAGGER_MS || 4000);
const HEARTBEAT_MS = Number(process.env.HEARTBEAT_MS || 3000);

const packets = JSON.parse(
  fs.readFileSync(path.join(repoRoot, 'public/project-packets.json'), 'utf8')
);
const projects = packets.projects.filter(p => p.submittedProject);

async function post(p, body) {
  try {
    const res = await fetch(`${URL}${p}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.warn(`! ${res.status} ${p} ${text.slice(0, 80)}`);
    }
    return res.ok;
  } catch (e) {
    console.warn(`! ${p}: ${e.message}`);
    return false;
  }
}

async function heartbeat(p) {
  return post(`/api/projects/${p.id}/heartbeat`, {
    status: 'online',
    consumes: p.canonicalSubscribes || p.subscribes || [],
    emits: p.canonicalEmits || p.emits || [],
    message: 'mock-projects.mjs',
  });
}

async function fireScenario(p) {
  const events = p.scenario?.events || [];
  for (const ev of events) {
    await post(`/api/projects/${p.id}/events`, {
      event_type: ev.event_type,
      payload: ev.payload || {},
    });
    await sleep(150);
  }
  return events.length;
}

console.log(`→ ${URL}`);
console.log(`→ activating ${projects.length} projects, ${STAGGER_MS} ms apart`);
console.log('');
for (const p of projects) {
  process.stdout.write(`  ${p.id.padEnd(20)} ${(p.title || '').padEnd(28)}`);
  await heartbeat(p);
  const n = await fireScenario(p);
  console.log(`  beat + ${n} event${n === 1 ? '' : 's'}`);
  await sleep(STAGGER_MS);
}
console.log('');
console.log(`→ all active. Cycling beats + scenario events every ${HEARTBEAT_MS} ms (Ctrl-C to stop)`);
console.log(`  (server caps state.events at 160 — re-emitting keeps each project's lastEvent fresh)`);

let cycles = 0;
process.on('SIGINT', () => {
  console.log(`\n→ stopped after ${cycles} cycles`);
  process.exit(0);
});

while (true) {
  // Serialize per project so its heartbeat + events land contiguously in the buffer.
  for (const p of projects) {
    await heartbeat(p);
    await fireScenario(p);
  }
  cycles++;
  if (cycles % 5 === 0) console.log(`  ${cycles} cycles`);
  await sleep(HEARTBEAT_MS);
}
