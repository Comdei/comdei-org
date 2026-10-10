// Worker da lista de interessados da Crisma de adultos (Comdei).
// Fluxo: Origin permitido -> rate limit por IP -> tamanho/JSON -> honeypot ->
// validação de campos -> Turnstile Siteverify (servidor) -> grava na planilha
// via Apps Script (segredo compartilhado). Nenhum segredo fica no código.
//
// Secrets (wrangler secret put): TURNSTILE_SECRET, SHEETS_WEBHOOK_URL,
// SHEETS_SHARED_SECRET, IP_SALT.  Vars: ALLOWED_ORIGINS, TURNSTILE_HOSTNAMES.

const MAX_BODY = 4096;
const LIMITS = { nome: 120, whatsapp: 20, email: 200, paroquia: 120 };
const SACRAMENTO = new Set(["sim", "nao", "nao_sei"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const SITEVERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

// Reserva quando o binding de rate limit não existe (ex.: teste local).
const memoryHits = new Map();

function list(v) {
  return String(v || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function json(status, body, origin) {
  const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
  if (origin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(v, max) {
  // tira caracteres de controle e espaços repetidos
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max + 1);
}

export function validate(input) {
  const errors = [];
  const out = {
    nome: clean(input.nome, LIMITS.nome),
    whatsapp: clean(input.whatsapp, LIMITS.whatsapp),
    email: clean(input.email, LIMITS.email).toLowerCase(),
    paroquia: clean(input.paroquia, LIMITS.paroquia),
    batizado: String(input.batizado || ""),
    comunhao: String(input.comunhao || ""),
  };
  for (const k of Object.keys(LIMITS)) if (out[k].length > LIMITS[k]) errors.push(k);
  if (out.nome.length < 2) errors.push("nome");
  const d = out.whatsapp.replace(/\D/g, "");
  if (d.length < 10 || d.length > 13) errors.push("whatsapp");
  if (out.email && !EMAIL_RE.test(out.email)) errors.push("email");
  if (!SACRAMENTO.has(out.batizado)) errors.push("batizado");
  if (!SACRAMENTO.has(out.comunhao)) errors.push("comunhao");
  if (input.consentimento !== true) errors.push("consentimento");
  out.whatsapp = d;
  return { ok: errors.length === 0, errors: [...new Set(errors)], data: out };
}

async function rateLimited(env, key) {
  if (env.RL_IP && typeof env.RL_IP.limit === "function") {
    const { success } = await env.RL_IP.limit({ key });
    return !success;
  }
  const now = Date.now();
  const hits = (memoryHits.get(key) || []).filter((t) => now - t < 60000);
  hits.push(now);
  memoryHits.set(key, hits);
  return hits.length > 3;
}

async function sha256(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyTurnstile(env, token, ip) {
  if (!token || typeof token !== "string" || token.length > 2048) return false;
  const form = new FormData();
  form.append("secret", env.TURNSTILE_SECRET);
  form.append("response", token);
  if (ip) form.append("remoteip", ip);
  form.append("idempotency_key", crypto.randomUUID());
  let res;
  try {
    res = await fetch(SITEVERIFY, { method: "POST", body: form });
  } catch (e) {
    return false;
  }
  if (!res.ok) return false;
  const out = await res.json();
  if (!out.success) return false;
  const hosts = list(env.TURNSTILE_HOSTNAMES);
  if (hosts.length && !hosts.includes(out.hostname)) return false;
  if (out.action && out.action !== "crisma-adultos") return false;
  return true;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin") || "";
    const allowed = list(env.ALLOWED_ORIGINS || "https://comdei.org,https://www.comdei.org");
    const okOrigin = allowed.includes(origin) ? origin : "";

    if (url.pathname !== "/inscricao") return json(404, { ok: false }, okOrigin);

    if (request.method === "OPTIONS") {
      if (!okOrigin) return new Response(null, { status: 403 });
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": okOrigin,
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Accept",
          "Access-Control-Max-Age": "600",
          "Vary": "Origin",
        },
      });
    }
    if (request.method !== "POST") return json(405, { ok: false }, okOrigin);
    if (!okOrigin) return json(403, { ok: false, error: "Origem não permitida." }, "");

    const ip = request.headers.get("CF-Connecting-IP") || "";
    if (await rateLimited(env, "ip:" + ip)) {
      return json(429, { ok: false, error: "Muitas tentativas. Tente mais tarde." }, okOrigin);
    }

    const ctype = request.headers.get("Content-Type") || "";
    if (!ctype.toLowerCase().startsWith("application/json")) return json(415, { ok: false }, okOrigin);
    const len = Number(request.headers.get("Content-Length") || "0");
    if (len > MAX_BODY) return json(413, { ok: false }, okOrigin);
    const raw = await request.text();
    if (raw.length > MAX_BODY) return json(413, { ok: false }, okOrigin);

    let input;
    try {
      input = JSON.parse(raw);
    } catch (e) {
      return json(400, { ok: false, error: "Dados inválidos." }, okOrigin);
    }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json(400, { ok: false }, okOrigin);

    // Honeypot: robô preencheu o campo escondido. Responde "ok" e descarta.
    if (input.site) return json(200, { ok: true }, okOrigin);

    const v = validate(input);
    if (!v.ok) {
      return json(422, { ok: false, error: "Confira os campos e tente de novo.", campos: v.errors }, okOrigin);
    }

    if (!(await verifyTurnstile(env, input.turnstileToken, ip))) {
      return json(403, { ok: false, error: "Não conseguimos confirmar a verificação. Recarregue a página e tente de novo." }, okOrigin);
    }

    const ipHash = ip ? (await sha256(env.IP_SALT + "|" + ip)).slice(0, 32) : "";
    let res;
    try {
      res = await fetch(env.SHEETS_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: env.SHEETS_SHARED_SECRET, ipHash, ...v.data, origem: okOrigin }),
        redirect: "follow",
      });
    } catch (e) {
      return json(502, { ok: false, error: "Não deu certo agora. Tente de novo ou chame no WhatsApp." }, okOrigin);
    }
    let out = {};
    try { out = await res.json(); } catch (e) {}
    if (out.ok) return json(200, { ok: true }, okOrigin);
    if (out.error === "rate") return json(429, { ok: false, error: "Muitas tentativas. Tente mais tarde." }, okOrigin);
    return json(502, { ok: false, error: "Não deu certo agora. Tente de novo ou chame no WhatsApp." }, okOrigin);
  },
};
