import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("../free-image-provider.js", import.meta.url), "utf8");

test("free image adapter exposes a public ZeroGPU provider without credentials", () => {
  assert.match(source, /mrfakename\/Z-Image-Turbo/);
  assert.doesNotMatch(source, /HF_TOKEN|FAL_KEY|api[_-]?key/i);
  const sandbox = { console, fetch: async () => { throw new Error("network should not run"); }, setTimeout, clearTimeout, AbortController };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "free-image-provider.js" });
  assert.equal(sandbox.ToonVerseFreeImage.provider, "Hugging Face ZeroGPU");
  assert.equal(typeof sandbox.ToonVerseFreeImage.generate, "function");
  assert.equal(typeof sandbox.ToonVerseFreeImage.health, "function");
});

test("free image adapter submits a text prompt to a Gradio image endpoint and parses the result", async () => {
  const calls = [];
  const config = {
    components: [
      { id: 1, type: "textbox", props: { value: "" } },
      { id: 2, type: "slider", props: { value: 6 } },
      { id: 3, type: "image", props: {} }
    ],
    dependencies: [{ api_name: "/generate", inputs: [1, 2], outputs: [3] }]
  };
  const responses = [
    { ok: true, json: async () => config },
    { ok: true, json: async () => ({ event_id: "job-123" }) },
    { ok: true, text: async () => 'event: complete\ndata: ["data:image/png;base64,AAAA"]\n\n' }
  ];
  const sandbox = {
    console, setTimeout, clearTimeout, AbortController,
    fetch: async (url, options={}) => {
      calls.push({ url, options });
      return responses.shift();
    }
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.runInNewContext(source, sandbox, { filename: "free-image-provider.js" });
  const result = await sandbox.ToonVerseFreeImage.generate("a colorful cartoon planet");
  assert.equal(result, "data:image/png;base64,AAAA");
  assert.equal(calls.length, 3);
  assert.match(calls[1].url, /gradio_api\/call\/generate$/);
  assert.deepEqual(JSON.parse(calls[1].options.body).data, ["a colorful cartoon planet", 6]);
});
