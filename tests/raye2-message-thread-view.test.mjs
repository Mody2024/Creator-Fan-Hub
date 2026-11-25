import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/raye2/raye2-client.tsx", "utf8");
const css = readFileSync("src/app/raye2/raye2.module.css", "utf8");

test("grouped replies can be opened in a focused thread panel", () => {
  assert.match(client, /const \[activeThreadRoot, setActiveThreadRoot\] = useState<Message \| null>\(null\)/);
  assert.match(client, /activeThreadReplies = activeThreadRoot \? currentMessages\.filter\(message => message\.parent_message_id === activeThreadRoot\.id\)/);
  assert.match(client, /message\.parent_message_id === null && messages\.some\(item => item\.parent_message_id === message\.id\)/);
  assert.match(client, /aria-label=\{isAr \? "سلسلة الردود" : "Message thread"\}/);
  assert.match(client, /Reply in thread/);
  assert.match(client, /الرد في السلسلة/);
});

test("thread panel handles empty replies, closes and resets on conversation switch", () => {
  assert.match(client, /No replies yet\. Start the conversation\./);
  assert.match(client, /لا توجد ردود بعد\. ابدأ المحادثة\./);
  assert.match(client, /historyRequestRef\.current \+= 1; setActiveThreadRoot\(null\); setHistoryHasMore\(true\); setHistoryLoading\(false\); \}, \[selectedId\]\)/);
  assert.match(client, /onClick=\{\(\) => setActiveThreadRoot\(null\)\} aria-label=\{isAr \? "إغلاق السلسلة" : "Close thread"\}>×/);
  assert.match(css, /\.threadPanel\{/);
  assert.match(css, /\.threadReplies\{/);
  assert.match(css, /\.threadReplyAction:disabled/);
});

test("conversation history can be paged backward without losing the current scroll position", () => {
  assert.match(client, /const \[historyLoading, setHistoryLoading\] = useState\(false\)/);
  assert.match(client, /const \[historyHasMore, setHistoryHasMore\] = useState\(true\)/);
  assert.match(client, /\.eq\("conversation_id", conversationId\)[\s\S]*\.order\("created_at", \{ ascending: false \}\)[\s\S]*\.limit\(PAGE_SIZE\)/);
  assert.match(client, /request = request\.lt\("created_at", oldest\)/);
  assert.match(client, /const PAGE_SIZE = 100/);
  assert.match(client, /setHistoryHasMore\(page\.length === PAGE_SIZE\)/);
  assert.match(client, /historyRequestRef\.current/);
  assert.match(client, /container\.scrollTop = previousTop \+ Math\.max\(0, container\.scrollHeight - previousHeight\)/);
  assert.match(client, /Load earlier messages/);
  assert.match(client, /تحميل الرسائل الأقدم/);
});


test("message realtime events update message state incrementally instead of reloading the platform", () => {
  const subscription = client.slice(client.indexOf('table: "raye2_messages"'), client.indexOf('table: "raye2_group_members"'));
  assert.match(subscription, /eventType === "DELETE"/);
  assert.match(subscription, /\.eq\("id", messageId\)\.maybeSingle\(\)/);
  assert.match(subscription, /setMessages\(current => current\.some\(item => item\.id === message\.id\)/);
  assert.match(subscription, /setPinnedMessages\(current => current\.filter\(message => message\.id !== messageId\)\)/);
  assert.match(subscription, /setThreads\(current => current\.map\(thread =>/);
  assert.doesNotMatch(subscription, /loadData\(/);
});

test("message realtime updates refresh sender identity and keep unread counts conversation-aware", () => {
  const subscription = client.slice(client.indexOf('table: "raye2_messages"'), client.indexOf('table: "raye2_group_members"'));
  assert.match(subscription, /from\("member_profiles"\)/);
  assert.match(subscription, /message\.sender_id !== userId/);
  assert.match(subscription, /messageConversationId !== selected\.conversationId/);
  assert.match(subscription, /thread\.unread \+ 1/);
  assert.match(subscription, /\.order\("created_at", \{ ascending: false \}\)\.limit\(1\)\.maybeSingle\(\)/);
});


test("message realtime keeps reactions and notification inbox current without a full reload", () => {
  assert.match(client, /table: "raye2_message_reactions"/);
  assert.match(client, /setReactionCounts\(current => \(\{ \.\.\.current, \[messageId\]: counts \}\)\)/);
  assert.match(client, /setMyReactions\(current => \(\{ \.\.\.current, \[messageId\]:/);
  assert.match(client, /table: "raye2_notifications", filter: "user_id=eq\." \+ userId/);
  assert.match(client, /setNotifications\(current => \[data as NotificationItem/);
});
