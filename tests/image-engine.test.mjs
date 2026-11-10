import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../image-engine.js", import.meta.url), "utf8");
const sandbox = { console, Math, Promise, encodeURIComponent };
sandbox.globalThis = sandbox;
vm.runInNewContext(source, sandbox, { filename: "image-engine.js" });
const engine = sandbox.AIAnimatorImageEngine;

test("image engine exposes a stable version and generation API", () => {
  assert.equal(engine.version, "1.0.0");
  assert.equal(typeof engine.generateBackground, "function");
  assert.equal(typeof engine.extractPalette, "function");
});

test("generates a self-contained SVG data URL without network providers", async () => {
  const result = await engine.generateBackground({
    prompt: "یک سیاره بنفش با درخت‌های ژله‌ای و کوه‌های کریستالی",
    preset: "story",
    mood: "sunset",
    composition: "layered",
    palette: "vivid",
    seed: 12345
  });
  assert.match(result.dataUrl, /^data:image\/svg\+xml;charset=utf-8,/);
  assert.match(result.svg, /<svg/);
  assert.equal(result.width, 1280);
  assert.equal(result.height, 720);
  assert.equal(result.environment, "space");
  assert.equal(result.seed, 12345);
  assert.match(result.svg, /linearGradient/);
});

test("environment detection handles the supported scene families", () => {
  assert.equal(engine.inferEnvironment("جنگل جادویی و درختان بلند", "story"), "nature");
  assert.equal(engine.inferEnvironment("زیر آب و مرجان‌های رنگی", "story"), "underwater");
  assert.equal(engine.inferEnvironment("اتاق کنترل یک آزمایشگاه فضایی", "story"), "interior");
  assert.equal(engine.inferEnvironment("خیابان‌های شهر آینده", "story"), "city");
  assert.equal(engine.inferEnvironment("سیاره‌ای دوردست در کهکشان", "story"), "space");
});

test("same prompt and seed produce deterministic vector output", async () => {
  const a = await engine.generateBackground({ prompt: "a neon city", seed: 77, preset: "city" });
  const b = await engine.generateBackground({ prompt: "a neon city", seed: 77, preset: "city" });
  assert.equal(a.svg, b.svg);
});

test("XML-sensitive prompt content is never injected into SVG markup", async () => {
  const result = await engine.generateBackground({ prompt: "<script>alert(1)</script>", seed: 9 });
  assert.doesNotMatch(result.svg, /<script>/);
});
