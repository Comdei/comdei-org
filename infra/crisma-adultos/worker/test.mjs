// Teste local leve: node test.mjs  (simula Turnstile e Apps Script, nada sai da máquina)
import assert from "node:assert";
import worker, { validate } from "./src/index.js";

const calls = [];
let lastBody = "{}";
globalThis.fetch = async (url, init) => {
  calls.push(String(url));
  if (String(url).includes("siteverify")) {
    const tok = init.body.get("response");
    const form = JSON.parse(lastBody).form || "crisma-adultos";
    return new Response(JSON.stringify({ success: tok === "good", hostname: "comdei.org", action: form }));
  }
  return new Response(JSON.stringify({ ok: true }));
};
const env = { TURNSTILE_SECRET: "x", SHEETS_WEBHOOK_URL: "https://sheets.test/exec", SHEETS_SHARED_SECRET: "s", IP_SALT: "salt",
  ALLOWED_ORIGINS: "https://comdei.org", TURNSTILE_HOSTNAMES: "comdei.org" };
const good = { nome: "Maria Silva", whatsapp: "(21) 99999-1234", email: "", paroquia: "", batizado: "sim", comunhao: "nao", consentimento: true, site: "", turnstileToken: "good" };
let n = 0;
const req = (body, origin = "https://comdei.org", ip) => (lastBody = JSON.stringify(body), new Request("https://w.test/inscricao", { method: "POST",
  headers: { "Content-Type": "application/json", Origin: origin, "CF-Connecting-IP": ip || "10.0.0." + (++n) }, body: JSON.stringify(body) }));

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
assert.equal((await worker.fetch(req({ ...good, nome: "a".repeat(9000) }), env)).status, 413);
const s = [];
for (let i = 0; i < 5; i++) s.push((await worker.fetch(req(good, undefined, "9.9.9.9"), env)).status);
assert.deepEqual(s, [200, 200, 200, 429, 429]);
assert.equal(validate(good).data.whatsapp, "21999991234");
// catequese infantil e pergunta
const cat = { form: "catequese-infantil", nome: "Ana Souza", whatsapp: "21 98888-7777", email: "", idade: "7 anos", consentimento: true, site: "", turnstileToken: "good" };
assert.equal((await worker.fetch(req(cat), env)).status, 200);
assert.equal((await worker.fetch(req({ ...cat, idade: "sete" }), env)).status, 422);
const per = { form: "pergunta", nome: "Ana", whatsapp: "21988887777", email: "", pergunta: "Precisa ser batizado?\nObrigada", consentimento: true, site: "", turnstileToken: "good" };
assert.equal((await worker.fetch(req(per), env)).status, 200);
assert.equal((await worker.fetch(req({ ...per, pergunta: "x".repeat(1200) }), env)).status, 422);
assert.equal((await worker.fetch(req({ ...per, form: "outro" }), env)).status, 422);
globalThis.fetch = async (url, init) => String(url).includes("siteverify")
  ? new Response(JSON.stringify({ success: true, hostname: "comdei.org", action: "crisma-adultos" }))
  : new Response(JSON.stringify({ ok: true }));
assert.equal((await worker.fetch(req(cat), env)).status, 403, "token de outro formulário é recusado");
console.log("ok: origem, turnstile, consentimento, tamanhos, honeypot, 413, rate limit, 3 formulários, ação do Turnstile");
