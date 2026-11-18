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
