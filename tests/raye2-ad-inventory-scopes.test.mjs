import test from "node:test";
import assert from "node:assert/strict";
import { resolveRaye2SponsorEligibility } from "../src/lib/raye2/sponsor-campaign-resolver.mjs";

const now = Date.parse("2026-11-18T12:00:00Z");
const campaign = (id, scope, extra = {}) => ({
  id, status: "active", campaignScope: scope, priority: 50,
  startsAt: "2026-11-01T00:00:00Z", endsAt: "2026-12-01T00:00:00Z",
  ...extra
});

test("community and minis campaigns are eligible only for their explicit inventory", () => {
  const minis = campaign("mini-1", { minis: true });
  const community = campaign("community-1", { community: true });
  const result = resolveRaye2SponsorEligibility({
    now, inventory: "minis", platformCampaigns: [minis, community]
  });
  assert.deepEqual(result.platformCampaigns.map(x => x.id), ["mini-1"]);
  assert.deepEqual(result.blockedPlatformCampaignIds, []);
  assert.equal(result.deliveryEnabled, false);
});

test("video and live campaign scopes remain distinct", () => {
  const video = campaign("video-1", { videos: true });
  const live = campaign("live-1", { live: true });
  assert.deepEqual(resolveRaye2SponsorEligibility({
    now, inventory: "video", platformCampaigns: [video, live]
  }).platformCampaigns.map(x => x.id), ["video-1"]);
  assert.deepEqual(resolveRaye2SponsorEligibility({
    now, inventory: "live", platformCampaigns: [video, live]
  }).platformCampaigns.map(x => x.id), ["live-1"]);
});

test("legacy campaigns without scope remain video-only", () => {
  const legacy = { id: "legacy", status: "active" };
  assert.equal(resolveRaye2SponsorEligibility({
    now, inventory: "video", platformCampaigns: [legacy]
  }).platformCampaigns.length, 1);
  assert.equal(resolveRaye2SponsorEligibility({
    now, inventory: "community", platformCampaigns: [legacy]
  }).platformCampaigns.length, 0);
});

test("creator exclusivity continues to block matching platform campaigns", () => {
  const creator = campaign("creator-1", { minis: true }, {
    categoryKey: "games", categoryExclusive: true
  });
  const blocked = campaign("platform-1", { minis: true }, {
    categoryKey: "games"
  });
  const allowed = campaign("platform-2", { minis: true }, {
    categoryKey: "education"
  });
  const result = resolveRaye2SponsorEligibility({
    now, inventory: "minis", creatorCampaigns: [creator],
    platformCampaigns: [blocked, allowed]
  });
  assert.deepEqual(result.platformCampaigns.map(x => x.id), ["platform-2"]);
  assert.deepEqual(result.blockedPlatformCampaignIds, ["platform-1"]);
});
