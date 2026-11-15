import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../src/app/community/community-client.tsx", import.meta.url), "utf8");

test("members can request a password reset link", () => {
  assert.match(client, /resetPasswordForEmail\(email\.trim\(\)/);
  assert.match(client, /redirectTo: window\.location\.origin \+ "\/community"/);
  assert.match(client, /resetSent/);
  assert.match(client, /resetSent:"If that account exists, we sent a reset link to its email\."/);
  assert.match(client, /resetSent:"أرسلنا رابط إعادة التعيين إلى بريدك الإلكتروني إن كان الحساب موجودًا\."/);
});

test("a recovery link opens a set-new-password form", () => {
  assert.match(client, /location\.hash\.includes\("type=recovery"\)/);
  assert.match(client, /event === "PASSWORD_RECOVERY"/);
  assert.match(client, /auth\.updateUser\(\{ password \}\)/);
  assert.match(client, /recoveryMode \? <section id="join"/);
  assert.match(client, /autoComplete="new-password"/);
});

test("password recovery is reachable from the sign-in card", () => {
  assert.match(client, /authMode==="signin" && <button[^>]*onClick=\{\(\)=>void sendReset\(\)\}/);
  assert.match(client, /forgot:"Forgot password\?"/);
  assert.match(client, /forgot:"نسيت كلمة المرور؟"/);
});
