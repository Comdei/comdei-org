// Teste local leve: node test.mjs  (simula Turnstile e Apps Script, nada sai da máquina)
import assert from "node:assert";
import worker, { validate } from "./src/index.js";

const calls = [];
globalThis.fetch = async (url, init) => {
  calls.push(String(url));
  if (String(url).includes("siteverify")) {
    const tok = init.body.get("response");
    return new Response(JSON.stringify({ success: tok === "good", hostname: "comdei.org", action: "crisma-adultos" }));
  }
  return new Response(JSON.stringify({ ok: true }));
};
const env = { TURNSTILE_SECRET: "x", SHEETS_WEBHOOK_URL: "https://sheets.test/exec", SHEETS_SHARED_SECRET: "s", IP_SALT: "salt",
  ALLOWED_ORIGINS: "https://comdei.org", TURNSTILE_HOSTNAMES: "comdei.org" };
const good = { nome: "Maria Silva", whatsapp: "(21) 99999-1234", email: "", paroquia: "", batizado: "sim", comunhao: "nao", consentimento: true, site: "", turnstileToken: "good" };
let n = 0;
const req = (body, origin = "https://comdei.org", ip) => new Request("https://w.test/inscricao", { method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": ip || "10.0.0." + (++n) }, body: JSON.stringify(body) });

assert.equal((await worker.fetch(req(good), env)).status, 200);
assert.equal((await worker.fetch(req(good, "https://evil.com"), env)).status, 403);
assert.equal((await worker.fetch(req({ ...good, turnstileToken: "bad" }), env)).status, 403);
assert.equal((await worker.fetch(req({ ...good, consentimento: false }), env)).status, 422);
assert.equal((await worker.fetch(req({ ...good, nome: "x".repeat(200) }), env)).status, 422);
assert.equal((await worker.fetch(req({ ...good, email: "nope" }), env)).status, 422);
assert.equal((await worker.fetch(req({ ...good, batizado: "talvez" }), env)).status, 422);
const before = calls.length;
const hp = await worker.fetch(req({ ...good, site: "http://spam" }), env);
assert.equal(hp.status, 200); assert.equal(calls.length, before, "honeypot não pode chamar ninguém");
assert.equal((await worker.fetch(req({ ...good, nome: "a".repeat(5000) }), env)).status, 413);
const s = [];
for (let i = 0; i < 5; i++) s.push((await worker.fetch(req(good, undefined, "9.9.9.9"), env)).status);
assert.deepEqual(s, [200, 200, 200, 429, 429]);
assert.equal(validate(good).data.whatsapp, "21999991234");
console.log("ok: origem, turnstile, consentimento, tamanhos, honeypot, 413, rate limit");
