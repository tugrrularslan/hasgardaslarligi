import assert from "node:assert/strict";
import { INCIDENT_MARKER, INCIDENT_TITLE, checkSite, runUptimeMonitor } from "./uptime-monitor.mjs";

const SITE_URL = "https://hasgardaslarligi.vercel.app";
const ENV = { GITHUB_REPOSITORY: "tugrrularslan/hasgardaslarligi", GITHUB_TOKEN: "test-token", SITE_URL };

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function createFetch(routes) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = input instanceof URL ? input.toString() : String(input);
    calls.push({ url, init });
    const response = await routes({ url, init, callIndex: calls.length - 1 });
    if (response instanceof Error) throw response;
    return response;
  };
  return { fetchImpl, calls };
}

{
  const check = await checkSite({ siteUrl: SITE_URL, fetchImpl: async () => ({ status: 200, url: SITE_URL }) });
  assert.deepEqual(check, { up: true, status: 200, finalUrl: SITE_URL });
}

{
  const { fetchImpl, calls } = createFetch(async ({ callIndex }) => {
    if (callIndex === 0) return new Error("connect ECONNREFUSED");
    if (callIndex === 1) return jsonResponse([]);
    if (callIndex === 2) return jsonResponse({ number: 42, html_url: "https://example.test/issues/42" }, 201);
    throw new Error("Beklenmeyen istek");
  });
  const result = await runUptimeMonitor({ env: ENV, fetchImpl, now: () => new Date("2026-11-01T15:00:00.000Z"), log: () => {} });
  assert.equal(result.status, "incident-opened");
  assert.equal(result.incidentNumber, 42);
  assert.equal(calls.length, 3);
  assert.equal(calls[2].init.method, "POST");
  const body = JSON.parse(calls[2].init.body);
  assert.equal(body.title, INCIDENT_TITLE);
  assert.match(body.body, new RegExp(INCIDENT_MARKER));
}

{
  const activeIncident = { number: 42, title: INCIDENT_TITLE, body: INCIDENT_MARKER, created_at: "2026-11-01T14:50:00.000Z" };
  const { fetchImpl, calls } = createFetch(async ({ callIndex }) => {
    if (callIndex === 0) return { status: 503, url: SITE_URL };
    if (callIndex === 1) return jsonResponse([activeIncident]);
    throw new Error("Açık kesintide ek bir GitHub isteği yapılmamalı");
  });
  const result = await runUptimeMonitor({ env: ENV, fetchImpl, now: () => new Date("2026-11-01T15:00:40.000Z"), log: () => {} });
  assert.equal(result.status, "incident-still-open");
  assert.equal(calls.length, 2);
}

{
  const activeIncident = { number: 42, title: INCIDENT_TITLE, body: INCIDENT_MARKER, created_at: "2026-11-01T14:50:00.000Z" };
  const { fetchImpl, calls } = createFetch(async ({ callIndex }) => {
    if (callIndex === 0) return { status: 200, url: SITE_URL };
    if (callIndex === 1) return jsonResponse([activeIncident]);
    if (callIndex === 2) return jsonResponse({ id: 1 }, 201);
    if (callIndex === 3) return jsonResponse({ ...activeIncident, state: "closed" });
    throw new Error("Beklenmeyen istek");
  });
  const result = await runUptimeMonitor({ env: ENV, fetchImpl, now: () => new Date("2026-11-01T15:00:40.000Z"), log: () => {} });
  assert.equal(result.status, "incident-closed");
  assert.equal(calls.length, 4);
  assert.equal(calls[2].init.method, "POST");
  assert.match(JSON.parse(calls[2].init.body).body, /10 dk 40 sn/);
  assert.equal(calls[3].init.method, "PATCH");
  assert.deepEqual(JSON.parse(calls[3].init.body), { state: "closed", state_reason: "completed" });
}

console.log("Uptime monitor checks passed.");
