import assert from "node:assert/strict";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { GITHUB_SYNC_AUDIENCE, verifyGithubSyncToken } from "../lib/github-sync-auth.ts";

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwk = await exportJWK(publicKey);
const keys = createLocalJWKSet({ keys: [{ ...jwk, kid: "test", alg: "RS256" }] });
const now = Math.floor(Date.now() / 1000);
const claims = {
  iss: "https://token.actions.githubusercontent.com", aud: GITHUB_SYNC_AUDIENCE,
  sub: "repo:tugrrularslan/hasgardaslarligi:ref:refs/heads/main",
  repository: "tugrrularslan/hasgardaslarligi", repository_id: "1307847878", repository_owner_id: "307523598",
  ref: "refs/heads/main", event_name: "schedule",
  workflow_ref: "tugrrularslan/hasgardaslarligi/.github/workflows/super-lig-sync.yml@refs/heads/main",
  iat: now, exp: now + 300,
};
async function token(changes = {}, signingKey = privateKey) {
  return new SignJWT({ ...claims, ...changes }).setProtectedHeader({ alg: "RS256", kid: "test" }).sign(signingKey);
}
await verifyGithubSyncToken(await token(), keys);
await verifyGithubSyncToken(await token({ event_name: "workflow_dispatch" }), keys);
for (const changes of [
  { repository: "other/repo" }, { repository_id: "1" }, { repository_owner_id: "1" },
  { ref: "refs/heads/feature" }, { workflow_ref: "tugrrularslan/hasgardaslarligi/.github/workflows/other.yml@refs/heads/main" },
  { sub: "repo:other/repo:ref:refs/heads/main" }, { event_name: "pull_request" },
  { aud: "other-service" }, { iss: "https://untrusted.example" },
  { exp: now - 60 }, { exp: undefined }, { iat: undefined }, { iat: now - 900 },
]) {
  await assert.rejects(() => token(changes).then(value => verifyGithubSyncToken(value, keys)));
}
const attacker = await generateKeyPair("RS256");
await assert.rejects(() => token({}, attacker.privateKey).then(value => verifyGithubSyncToken(value, keys)));
await assert.rejects(() => verifyGithubSyncToken("former-shared-secret", keys));
console.log("GitHub kimliği: imza, süre, hedef, depo, ana dal ve görev sınırları doğrulandı.");
