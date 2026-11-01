import { fileURLToPath } from "node:url";

export const INCIDENT_TITLE = "[Uptime] Has Gardaşlar Ligi erişim kesintisi";
export const INCIDENT_MARKER = "<!-- hasgardas-uptime-monitor -->";

const DEFAULT_SITE_URL = "https://hasgardaslarligi.vercel.app";
const DEFAULT_TIMEOUT_MS = 20_000;

function required(env, name) {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} ortam değişkeni zorunludur.`);
  return value;
}

function toIso(value) {
  return new Date(value).toISOString();
}

function formatDuration(milliseconds) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} sa ${minutes} dk ${seconds} sn`;
  if (minutes > 0) return `${minutes} dk ${seconds} sn`;
  return `${seconds} sn`;
}

function displayFailure(check) {
  if (typeof check.status === "number") return `HTTP ${check.status}`;
  return check.error || "Bilinmeyen erişim hatası";
}

export async function checkSite({ siteUrl, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  const url = new URL(siteUrl);
  if (url.protocol !== "https:") throw new Error("SITE_URL yalnızca HTTPS adresi olabilir.");

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "hasgardaslarligi-uptime-monitor/1.0",
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    return {
      up: response.status >= 200 && response.status < 400,
      status: response.status,
      finalUrl: response.url || url.toString(),
    };
  } catch (error) {
    return { up: false, error: error instanceof Error ? error.message : "Bilinmeyen ağ hatası" };
  }
}

function isMonitorIncident(issue) {
  return !issue.pull_request && issue.title === INCIDENT_TITLE &&
    typeof issue.body === "string" && issue.body.includes(INCIDENT_MARKER);
}

function buildFailureBody({ siteUrl, checkedAt, check }) {
  return `${INCIDENT_MARKER}

## Erişim kesintisi algılandı

- Site: ${siteUrl}
- Başlangıç (UTC): ${checkedAt}
- Sonuç: ${displayFailure(check)}

Bu kayıt GitHub Actions tarafından otomatik oluşturuldu. Site tekrar erişilebilir olduğunda aynı kayda bitiş zamanı ve tahmini kesinti süresi eklenecektir.`;
}

function buildRecoveryComment({ startedAt, recoveredAt, check }) {
  const duration = Date.parse(recoveredAt) - Date.parse(startedAt);
  return `## ✅ Site yeniden erişilebilir

- Başlangıç (UTC): ${startedAt}
- Bitiş (UTC): ${recoveredAt}
- Tahmini kesinti süresi: ${formatDuration(duration)}
- Doğrulama: HTTP ${check.status}

Bu kaydın durumu otomatik olarak kapatıldı.`;
}

function createGithubApi({ token, fetchImpl, apiUrl }) {
  const baseUrl = new URL(apiUrl);
  return async function githubApi(path, init = {}) {
    const response = await fetchImpl(new URL(path, baseUrl), {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "User-Agent": "hasgardaslarligi-uptime-monitor/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
        ...init.headers,
      },
    });
    if (!response.ok) {
      const details = await response.text();
      throw new Error(`GitHub API isteği başarısız oldu (${response.status}): ${details}`);
    }
    if (response.status === 204) return null;
    return response.json();
  };
}

export async function runUptimeMonitor({ env = process.env, fetchImpl = fetch, now = () => new Date(), log = console.log } = {}) {
  const siteUrl = env.SITE_URL?.trim() || DEFAULT_SITE_URL;
  const repository = required(env, "GITHUB_REPOSITORY");
  const token = required(env, "GITHUB_TOKEN");
  const checkedAt = toIso(now());
  const api = createGithubApi({ token, fetchImpl, apiUrl: env.GITHUB_API_URL || "https://api.github.com/" });
  const check = await checkSite({ siteUrl, fetchImpl });
  const issues = await api(`/repos/${repository}/issues?state=open&per_page=100&sort=created&direction=desc`);
  const activeIncident = issues.find(isMonitorIncident);

  if (!check.up && !activeIncident) {
    const incident = await api(`/repos/${repository}/issues`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: INCIDENT_TITLE, body: buildFailureBody({ siteUrl, checkedAt, check }) }),
    });
    log(`Erişim kesintisi kaydedildi: ${incident.html_url}`);
    return { status: "incident-opened", checkedAt, check, incidentNumber: incident.number };
  }

  if (!check.up) {
    log(`Site hâlâ erişilemez (${displayFailure(check)}); açık kayıt #${activeIncident.number} korunuyor.`);
    return { status: "incident-still-open", checkedAt, check, incidentNumber: activeIncident.number };
  }

  if (activeIncident) {
    const startedAt = toIso(activeIncident.created_at);
    const comment = buildRecoveryComment({ startedAt, recoveredAt: checkedAt, check });
    await api(`/repos/${repository}/issues/${activeIncident.number}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: comment }),
    });
    await api(`/repos/${repository}/issues/${activeIncident.number}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ state: "closed", state_reason: "completed" }),
    });
    log(`Site yeniden erişilebilir; kayıt #${activeIncident.number} kapatıldı.`);
    return { status: "incident-closed", checkedAt, check, incidentNumber: activeIncident.number };
  }

  log(`Site erişilebilir (HTTP ${check.status}).`);
  return { status: "healthy", checkedAt, check };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  runUptimeMonitor().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
