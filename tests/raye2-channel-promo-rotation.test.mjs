import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRaye2ChannelPromo, selectRaye2ChannelPromo } from "../src/lib/raye2/channel-promo-rotation.mjs";

const promo=(id,extra={})=>({id,title:"Channel clip "+id,url:"https://www.youtube.com/watch?v=abcdefghijk",...extra});

test("normalizes valid YouTube promos and defaults to all placements",()=>{
 const result=normalizeRaye2ChannelPromo(promo("a"));
 assert.equal(result.label,"Featured channel");
 assert.deepEqual(result.placements,["video","live","minis","community"]);
 assert.equal(result.cta,"Watch on YouTube");
});

test("rejects non-YouTube and insecure destinations",()=>{
 assert.equal(normalizeRaye2ChannelPromo(promo("a",{url:"https://example.com/ad"})),null);
 assert.equal(normalizeRaye2ChannelPromo(promo("a",{url:"http://youtube.com/watch?v=x"})),null);
});

test("selects eligible promos without repeating recent ids",()=>{
 const selected=selectRaye2ChannelPromo({
  promos:[promo("a"),promo("b")],placement:"minis",recentPromoIds:["a"],random:()=>0
 });
 assert.equal(selected.id,"b");
});

test("resets rotation after every eligible promo has been shown",()=>{
 const selected=selectRaye2ChannelPromo({
  promos:[promo("a"),promo("b")],placement:"community",recentPromoIds:["a","b"],random:()=>0.99
 });
 assert.equal(selected.id,"b");
});

test("respects active state and placement targeting",()=>{
 const selected=selectRaye2ChannelPromo({
  promos:[promo("inactive",{active:false}),promo("video",{placements:["video"]})],
  placement:"community"
 });
 assert.equal(selected,null);
});

test("long-video promo uses a short chapter-aware segment, not the full upload",()=>{
 const selected=selectRaye2ChannelPromo({
  promos:[promo("long",{
   videoId:"abcdefghijk",durationSeconds:840,
   chapters:[{title:"Intro",startSeconds:0},{title:"Main section",startSeconds:240},{title:"Ending",startSeconds:700}]
  })],
  placement:"video",random:()=>0
 });
 assert.equal(selected.promoDurationSeconds,15);
 assert.equal(selected.promoStartSeconds,240);
 assert.equal(selected.promoEndSeconds,255);
});

test("long-video and live placements reject short uploads",()=>{
 const selected=selectRaye2ChannelPromo({
  promos:[promo("short",{videoId:"abcdefghijk",durationSeconds:45})],
  placement:"live",random:()=>0
 });
 assert.equal(selected,null);
});

test("long-video promo falls back to a bounded short excerpt when no chapters exist",()=>{
 const selected=selectRaye2ChannelPromo({
  promos:[promo("long",{videoId:"abcdefghijk",durationSeconds:840,chapters:[]})],
  placement:"live",random:()=>0
 });
 assert.equal(selected.promoDurationSeconds,15);
 assert.ok(selected.promoStartSeconds>=10);
 assert.ok(selected.promoEndSeconds<=840);
});
