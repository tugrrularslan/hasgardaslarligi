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
  const expectedClaims = {
    repository: REPOSITORY,
    repository_id: "1307847878",
    repository_owner_id: "307523598",
    ref: "refs/heads/main",
    workflow_ref: WORKFLOW,
    sub: "repo:tugrrularslan@307523598/hasgardaslarligi@1307847878:ref:refs/heads/main",
  };
  for (const [name, expected] of Object.entries(expectedClaims)) {
    if (payload[name] !== expected) throw new Error(`github-policy:${name}`);
  }
  if (!["schedule", "workflow_dispatch"].includes(String(payload.event_name))) {
    throw new Error("github-policy:event_name");
  }
}
