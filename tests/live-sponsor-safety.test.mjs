import test from "node:test";
import assert from "node:assert/strict";
import {evaluateLiveSponsorInsertion as evaluate} from "../src/lib/raye2/live-sponsor-safety.mjs";

const safe={
 provider:"provider-x",providerCapabilities:{liveMidroll:true,dvrReplay:true},
 adapterReady:true,streamState:"live",breakType:"streamer_declared_break",
 streamerDeclared:true,creatorCampaignEligible:true,viewerFrequencyAllowed:true,
 disclosureReady:true,contextReplaySeconds:5
};
test("permits only a compliant declared live break when a verified adapter exists",()=>{
 const result=evaluate(safe);
 assert.equal(result.permitted,true);
 assert.equal(result.insertionRequestAllowed,true);
 assert.equal(result.action,"no_insertion");
 assert.equal(result.contextReplaySeconds,5);
});
test("fails closed without a real provider adapter or provider capability",()=>{
 for(const patch of [{adapterReady:false},{providerCapabilities:{liveMidroll:false,dvrReplay:false}},{provider:""}]){
  const result=evaluate({...safe,...patch});
  assert.equal(result.permitted,false);
  assert.equal(result.insertionRequestAllowed,false);
  assert.equal(result.contextReplaySeconds,0);
 }
});
test("never permits gameplay, conversation or key events",()=>{
 for(const breakType of ["gameplay","conversation","key_event"]){
  const result=evaluate({...safe,breakType});
  assert.equal(result.permitted,false);
  assert.ok(result.reasons.includes("unsafe_break_type"));
 }
});
test("requires streamer declaration, live state, campaign eligibility, frequency and disclosure",()=>{
 for(const patch of [{streamerDeclared:false},{streamState:"ended"},{creatorCampaignEligible:false},{viewerFrequencyAllowed:false},{disclosureReady:false}]){
  assert.equal(evaluate({...safe,...patch}).permitted,false);
 }
});
test("context replay is capped at five seconds and disabled without provider DVR",()=>{
 assert.equal(evaluate({...safe,contextReplaySeconds:99}).contextReplaySeconds,5);
 assert.equal(evaluate({...safe,providerCapabilities:{liveMidroll:true,dvrReplay:false}}).contextReplaySeconds,0);
});
test("unknown inputs fail closed",()=>{
 const result=evaluate({});
 assert.equal(result.permitted,false);
 assert.equal(result.insertionRequestAllowed,false);
 assert.equal(result.contextReplaySeconds,0);
});
