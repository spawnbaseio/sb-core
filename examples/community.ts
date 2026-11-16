import { Community } from "../src/community.js";

const key = process.env.SPAWNBASE_COMMUNITY_KEY;
const policyId = process.env.SPAWNBASE_POLICY_ID;
const accountId = process.env.COMMUNITY_ACCOUNT_ID;
if (!key || !policyId || !accountId)
  throw new Error("Set the server key, policy ID and authenticated community account ID");

const community = new Community(key);
const flow = await community.createFlow({ policyId, accountId, revision: Date.now(), eligible: true });
process.stdout.write(flow.url + "\n");
