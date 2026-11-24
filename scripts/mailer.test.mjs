import { test } from "node:test";
import assert from "node:assert/strict";
import { compose, due, esc } from "./mailer.mjs";

const H = 3600_000;
const NOW = Date.UTC(2026, 10, 24, 12);
const res = (ageH, mailed) => ({ reservedAt: NOW - ageH * H, mailed });

test("due: welcome first, reminder from 48h, expire at 72h", () => {
  assert.equal(due(res(0), NOW), "welcome");
  assert.equal(due(res(47, { welcome: true }), NOW), null);
  assert.equal(due(res(48, { welcome: true }), NOW), "reminder");
  assert.equal(due(res(71, { welcome: true }), NOW), "reminder");
  assert.equal(due(res(71, { welcome: true, reminder: true }), NOW), null);
  assert.equal(due(res(72, { welcome: true, reminder: true }), NOW), "expire");
  assert.equal(due(res(72), NOW), "expire");
});

test("due: a reservation the mailer never saw still gets its welcome before the reminder", () => {
  assert.equal(due(res(50), NOW), "welcome");
});

test("e-mails escape guest-typed text and carry the personal link", () => {
  const mail = compose("welcome", {
    res: { token: "abc", name: "<b>Maria</b> Silva", reservedAt: NOW, email: "m@x.com", tier: "Prima" },
    gift: { name: "Luminária", model: "X-1", links: [{ store: "Amazon", url: "https://a.co/x", coupon: "OFF10" }] },
    delivery: { recipient: "Nathália", address: "Rua A, 1" },
    site: "https://nyhome.github.io",
  });
  assert.ok(mail.html.includes("https://nyhome.github.io/reserva?t=abc"));
  assert.ok(mail.html.includes("&lt;b&gt;Maria&lt;/b&gt;"));
  assert.ok(!mail.html.includes("<b>Maria</b>"));
  assert.ok(mail.html.includes("OFF10") && mail.html.includes("Nathália"));
  assert.equal(esc(`"&'`), "&quot;&amp;&#39;");
});
