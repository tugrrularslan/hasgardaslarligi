import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

export const GITHUB_SYNC_AUDIENCE = "https://hasgardaslarligi.vercel.app/api/admin/sync-super-lig";
const ISSUER = "https://token.actions.githubusercontent.com";
const REPOSITORY = "tugrrularslan/hasgardaslarligi";
const WORKFLOW = `${REPOSITORY}/.github/workflows/super-lig-sync.yml@refs/heads/main`;
const githubKeys = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks`), { timeoutDuration: 5000 });

/** Trust only this repository's main-branch result workflow, using short-lived GitHub identity. */
export async function verifyGithubSyncToken(token: string, keys: JWTVerifyGetKey = githubKeys) {
  const { payload } = await jwtVerify(token, keys, {
    issuer: ISSUER,
    audience: GITHUB_SYNC_AUDIENCE,
    algorithms: ["RS256"],
    requiredClaims: ["exp", "iat"],
    maxTokenAge: "10m",
    clockTolerance: 5,
  });
  if (payload.repository !== REPOSITORY || payload.repository_id !== "1307847878" ||
      payload.repository_owner_id !== "307523598" || payload.ref !== "refs/heads/main" ||
      payload.workflow_ref !== WORKFLOW ||
      payload.sub !== `repo:${REPOSITORY}:ref:refs/heads/main` ||
      !["schedule", "workflow_dispatch"].includes(String(payload.event_name))) {
    throw new Error("Bu GitHub görevinin sonuç eşitleme yetkisi yok.");
  }
}
