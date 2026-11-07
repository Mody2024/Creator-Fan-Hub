import test from "node:test";
import assert from "node:assert/strict";
import {resolveRaye2SponsorEligibility as resolve} from "../src/lib/raye2/sponsor-campaign-resolver.mjs";
const now=Date.parse("2026-11-07T12:00:00Z");
const base={status:"active",startsAt:"2026-11-01T00:00:00Z",endsAt:"2026-11-30T00:00:00Z",inventory:"video",allowedRegions:["EG"],maxPerViewer:2};
test("creator exclusivity blocks same-category platform campaigns",()=>{
 const result=resolve({now,region:"eg",creatorCampaigns:[{...base,id:"creator",categoryKey:"games",categoryExclusive:true}],platformCampaigns:[{...base,id:"platform",categoryKey:"games",priority:99},{...base,id:"other",categoryKey:"books"}]});
 assert.deepEqual(result.blockedPlatformCampaignIds,["platform"]);
 assert.deepEqual(result.platformCampaigns.map(x=>x.id),["other"]);
});
test("schedule, region, inventory, status and frequency caps are enforced",()=>{
 const result=resolve({now,region:"EG",inventory:"live",viewerFrequency:{capped:2},platformCampaigns:[
 {...base,id:"wrong-region",allowedRegions:["US"]},
 {...base,id:"wrong-inventory",inventory:"video"},
 {...base,id:"expired",endsAt:"2026-11-06T00:00:00Z"},
 {...base,id:"paused",status:"paused"},
 {...base,id:"capped"},
 {...base,id:"eligible",inventory:"live"}
 ]});
 assert.deepEqual(result.platformCampaigns.map(x=>x.id),["eligible"]);
});
test("creator and platform campaigns remain separate and delivery is always disabled",()=>{
 const result=resolve({now,region:"EG",creatorCampaigns:[{...base,id:"own"}],platformCampaigns:[{...base,id:"platform"}]});
 assert.deepEqual(result.creatorCampaigns.map(x=>x.id),["own"]);
 assert.deepEqual(result.platformCampaigns.map(x=>x.id),["platform"]);
 assert.equal(result.deliveryEnabled,false);
});
test("platform campaigns are ordered by priority without changing creator contracts",()=>{
 const result=resolve({now,region:"EG",platformCampaigns:[{...base,id:"low",priority:2},{...base,id:"high",priority:90}]});
 assert.deepEqual(result.platformCampaigns.map(x=>x.id),["high","low"]);
});
