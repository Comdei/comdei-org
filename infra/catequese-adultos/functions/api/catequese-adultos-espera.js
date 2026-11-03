// POST /api/catequese-adultos-espera  (Pages Function `onRequestPost` ou Worker via `handle`)
// GO-LIVE (preparado, NÃO publicado). Padrão DRY-RUN: sem os secrets, valida e devolve o registro normalizado, sem gravar.
// Com SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + IP_HASH_SALT, grava SÓ pela RPC
//   public.catequese_adultos_inscrever (SECURITY DEFINER, EXECUTE só service_role) em aica-prod.
// Fail-closed: com as chaves do banco mas sem IP_HASH_SALT, recusa (500 'config') e não grava.
// A chave nunca vai ao front nem para o log. Nenhum IP bruto é guardado: só sha256(sal|ip).

export const CONSENT_VERSION = 'lgpd-v1';
// PROVISIONAL: texto do aviso acima do botão, pendente de aprovação do Lucas.
// Não entra no catálogo interno.consent_versions (lá a versão só pode ser lgpd-vN).
export const AVISO_PRIVACIDADE_VERSAO = 'aviso-privacidade-v0';
// 2ª caixa (opcional): mensagens de boas-vindas e lembretes. A versão vigente e a data são definidas
// no banco (interno.consent_versions, finalidade catequese_adultos_mensagens); o cliente só manda o booleano.
export const MSG_OPTIN_FINALIDADE = 'catequese_adultos_mensagens';
export const MSG_OPTIN_VERSION = 'lgpd-v1';
// Texto aprovado. Único espaço reservado: {nome}. Sem link de grupo e sem datas.
export const TEXTO_BOAS_VINDAS =
  'Olá, {nome}! Aqui é o Lucas, da Comdei. Recebi sua inscrição na catequese de adultos. Quando a turma estiver formada e as datas dos encontros forem marcadas, mando por aqui o link do grupo e o calendário. Se tiver qualquer dúvida, é só responder esta mensagem. Que Deus te abençoe!';
// E-mail interno. O formulário público do site já avisa lucas@comdei.org.
// FORMSPREE_ENDPOINT (env do Worker) substitui o endereço; a URL abaixo não é segredo.
const NOTIFY_TO = 'lucas@comdei.org';
const FORMSPREE_PADRAO = 'https://formspree.io/f/xyeyllry';
const RPC = 'catequese_adultos_inscrever';
const RL_MAX = 5;            // envios
const RL_WINDOW_S = 600;     // por 10 minutos
const SIMNAO = ['sim', 'nao', 'nao_sei'];
const COMO_SOUBE = ['missa', 'irmandade', 'amigo_familia', 'whatsapp', 'instagram', 'facebook', 'cartaz', 'site', 'outro'];
const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
const ALLOWED = new Set(['nome', 'whatsapp', 'bairro_cidade', 'email', 'batizado', 'primeira_comunhao',
  'como_soube', 'como_soube_outro', 'maior_18', 'consentimento', 'consent_version', 'aviso_privacidade_versao',
  'msg_optin', 'msg_optin_version', 'site_url', 'referrer', 'cf-turnstile-response', ...UTM]);

const clean = (v, max) => (typeof v === 'string' ? v.normalize('NFC').replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');
const truthy = (v) => v === true || v === 'true' || v === 'on' || v === '1' || v === 1;

export function normalizarWhatsapp(raw) {
  let d = String(raw || '').replace(/\D/g, '');
  if (d.length >= 12 && d.startsWith('55')) d = d.slice(2);
  if (d.length === 11 && d.startsWith('0')) d = d.slice(1); // 0DD...
  if (d.length !== 10 && d.length !== 11) return null;
  const ddd = +d.slice(0, 2);
  if (ddd < 11 || ddd > 99 || d[0] === '0' || d[1] === '0') return null;
  if (d.length === 11 && d[2] !== '9') return null;          // celular: 9 + 8 dígitos
  if (d.length === 10 && !/[2-5]/.test(d[2])) return null;    // fixo (WhatsApp Business)
  if (/^(\d)\1+$/.test(d.slice(2))) return null;               // 99999-9999 etc.
  return '+55' + d;
}

export function validar(body) {
  const erros = {};
  const b = body && typeof body === 'object' ? body : {};
  // campos não previstos (ex.: cpf, estado_civil, nascimento) são ignorados e não ecoados
  const ignorados = Object.keys(b).filter((k) => !ALLOWED.has(k) && k !== 'website');

  const nome = clean(b.nome, 120);
  if (nome.length < 2 || !/\p{L}/u.test(nome)) erros.nome = 'Informe seu nome.';
  const whatsapp = normalizarWhatsapp(b.whatsapp);
  if (!whatsapp) erros.whatsapp = 'Informe um WhatsApp válido com DDD.';
  const bairro_cidade = clean(b.bairro_cidade, 120);
  if (bairro_cidade.length < 2) erros.bairro_cidade = 'Informe seu bairro ou cidade.';
  let email = clean(b.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) erros.email = 'E-mail inválido (ou deixe em branco).';
  if (!email) email = null;
  const batizado = clean(b.batizado, 10);
  if (!SIMNAO.includes(batizado)) erros.batizado = 'Escolha uma opção.';
  const primeira_comunhao = clean(b.primeira_comunhao, 10);
  if (!SIMNAO.includes(primeira_comunhao)) erros.primeira_comunhao = 'Escolha uma opção.';
  const como_soube = clean(b.como_soube, 20) || null;
  if (como_soube && !COMO_SOUBE.includes(como_soube)) erros.como_soube = 'Opção inválida.';
  let como_soube_outro = clean(b.como_soube_outro, 120) || null;
  if (como_soube === 'outro' && !como_soube_outro) erros.como_soube_outro = 'Conte como soube.';
  if (como_soube !== 'outro') como_soube_outro = null;
  if (!truthy(b.maior_18)) erros.maior_18 = 'Confirme que tem 18 anos ou mais.';
  if (!truthy(b.consentimento)) erros.consentimento = 'Precisamos do seu consentimento.';
  if (b.consent_version && b.consent_version !== CONSENT_VERSION) erros.consent_version = 'Texto de consentimento desatualizado. Recarregue a página.';
  if (b.aviso_privacidade_versao && b.aviso_privacidade_versao !== AVISO_PRIVACIDADE_VERSAO) {
    erros.aviso_privacidade_versao = 'Texto de privacidade desatualizado. Recarregue a página.';
  }

  const utm = {};
  for (const k of UTM) utm[k] = clean(b[k], 200) || null;
  const registro = {
    nome, whatsapp, bairro_cidade, email, batizado, primeira_comunhao, como_soube, como_soube_outro,
    maior_18: true, consent_version: CONSENT_VERSION, aviso_privacidade_versao: AVISO_PRIVACIDADE_VERSAO,
    msg_optin: b.msg_optin === true || b.msg_optin === 'true' || b.msg_optin === 'on', ...utm,
  };
  return { ok: Object.keys(erros).length === 0, erros, registro, ignorados };
}

async function sha256hex(s) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, '0')).join('');
}

// Limite por IP: memória do isolate + Cache API do datacenter (sem KV, sem recurso novo). Best-effort.
const mem = new Map();
export async function limitar(ipHash, now = Date.now()) {
  const win = Math.floor(now / 1000 / RL_WINDOW_S);
  const key = `${ipHash}:${win}`;
  let n = (mem.get(key) || 0) + 1;
  let cache = null;
  try { cache = typeof caches !== 'undefined' ? caches.default : null; } catch { cache = null; }
  const url = `https://rl.internal/catequese/${key}`;
  if (cache) {
    try { const r = await cache.match(url); if (r) n = Math.max(n, (+(await r.text()) || 0) + 1); } catch {}
  }
  mem.set(key, n);
  if (mem.size > 5000) for (const k of mem.keys()) { if (!k.endsWith(':' + win)) mem.delete(k); }
  if (cache) {
    try { await cache.put(url, new Response(String(n), { headers: { 'Cache-Control': `max-age=${RL_WINDOW_S}` } })); } catch {}
  }
  return n <= RL_MAX;
}

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' },
});

export async function handle(request, env = {}) {
  if (request.method !== 'POST') return json({ ok: false, erro: 'metodo' }, 405);
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) return json({ ok: false, erro: 'content-type' }, 415);
  const raw = await request.text();
  if (raw.length > 8000) return json({ ok: false, erro: 'grande_demais' }, 413);
  let body; try { body = JSON.parse(raw); } catch { return json({ ok: false, erro: 'json' }, 400); }

  const ip = request.headers.get('cf-connecting-ip') || '0.0.0.0';
  const dbConfigurado = !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  if (dbConfigurado && !env.IP_HASH_SALT) {
    console.log(JSON.stringify({ evt: 'catequese_adultos_espera', evento: 'config_sem_sal' }));
    return json({ ok: false, erro: 'config' }, 500);
  }
  const salt = env.IP_HASH_SALT || 'previa-sal-fallback';
  const ip_hash = await sha256hex(`${salt}|${ip}`);
  const log = (evento, extra = {}) => console.log(JSON.stringify({ evt: 'catequese_adultos_espera', evento, ip_hash: ip_hash.slice(0, 16), ...extra }));

  // honeypot: campo invisível "website" precisa vir vazio
  if (typeof body.website === 'string' && body.website.trim() !== '') { log('honeypot'); return json({ ok: false, erro: 'rejeitado' }, 400); }

  if (!(await limitar(ip_hash))) { log('rate_limit'); return json({ ok: false, erro: 'muitas_tentativas' }, 429); }

  // Turnstile só se já existir um secret configurado (nenhum widget foi criado)
  if (env.TURNSTILE_SECRET_KEY) {
    const fd = new FormData();
    fd.append('secret', env.TURNSTILE_SECRET_KEY); fd.append('response', String(body['cf-turnstile-response'] || '')); fd.append('remoteip', ip);
    const tr = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: fd }).then((r) => r.json()).catch(() => ({}));
    if (!tr.success) { log('turnstile'); return json({ ok: false, erro: 'verificacao' }, 400); }
  }

  const v = validar(body);
  if (!v.ok) { log('invalido', { campos: Object.keys(v.erros) }); return json({ ok: false, erros: v.erros }, 422); }

  const now = new Date();
  const expires = new Date(now); expires.setUTCMonth(expires.getUTCMonth() + 24);
  const referrer = clean(body.referrer, 300) || clean(request.headers.get('referer'), 300) || null;
  const registro = { ...v.registro, referrer, consent_at: now.toISOString(), ip_hash, expires_at: expires.toISOString(),
    // horário do aceite do aviso, no relógio do Worker (ISO). O cliente não manda essa data.
    aviso_privacidade_aceito_em: now.toISOString(),
    // só informativo no dry-run; na gravação real versão e data do opt-in vêm do banco
    msg_optin_version: v.registro.msg_optin ? MSG_OPTIN_VERSION : null, msg_optin_at: v.registro.msg_optin ? now.toISOString() : null };

  if (!dbConfigurado) {
    log('dry_run');
    return json({ ok: true, dry_run: true, registro, campos_ignorados: v.ignorados });
  }
  const r = await chamarRpc(env, registro);
  if (r.status === 429) { log('rate_limit_db'); return json({ ok: false, erro: 'muitas_tentativas' }, 429); }
  if (r.status === 400) { log('db_invalido'); return json({ ok: false, erro: 'invalido' }, 422); }
  if (!r.ok) { log('db_erro', { status: r.status }); return json({ ok: false, erro: 'gravacao' }, 502); }
  log(r.duplicado ? 'duplicado' : 'gravado');
  // Só a linha criada agora. Duplicata nas últimas 24 h não recebe e-mail nem WhatsApp.
  // Não há leitura nem reenvio de inscrições anteriores.
  if (!r.duplicado) await avisarNovaInscricao(env, registro, log);
  return json({ ok: true, dry_run: false });
}

async function avisarNovaInscricao(env, registro, log) {
  try {
    const mail = await notificarInscricao(env, registro);
    if (!mail.enviado) log('email_falhou', { motivo: mail.motivo, status: mail.status || 0 });
    else log('email_ok');
  } catch { log('email_falhou', { motivo: 'excecao' }); }
  try {
    const wa = await enviarBoasVindasNovaInscricao(env, registro);
    if (wa.motivo !== 'desligado') log('whatsapp_boas_vindas', { motivo: wa.motivo, status: wa.status || 0 });
  } catch { log('whatsapp_boas_vindas', { motivo: 'excecao' }); }
}

export function whatsappBoasVindasLigado(env) {
  const v = String((env && env.WHATSAPP_BOAS_VINDAS) || '').trim().toLowerCase();
  return v === '1' || v === 'on' || v === 'true';
}

export function textoBoasVindas(nome) {
  const limpo = String(nome || '').replace(/[{}]/g, '').trim().slice(0, 120);
  return TEXTO_BOAS_VINDAS.replaceAll('{nome}', limpo);
}

// WuzAPI: POST {WUZAPI_BASE_URL}/chat/send/text com o header Token.
// Os valores ficam só no ambiente. Este módulo não grava URL nem token.
export async function enviarTextoWuzapi({ baseUrl, token, phone, text, fetchImpl = fetch }) {
  const base = String(baseUrl || '').trim().replace(/\/+$/, '');
  const tok = String(token || '').trim();
  const destino = String(phone || '').replace(/\D/g, '');
  if (!base || !tok) return { enviado: false, motivo: 'sem_config' };
  if (!destino) return { enviado: false, motivo: 'sem_telefone' };
  let r;
  try {
    r = await fetchImpl(`${base}/chat/send/text`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Token: tok },
      body: JSON.stringify({ Phone: destino, Body: text }),
    });
  } catch {
    return { enviado: false, motivo: 'rede' };
  }
  return { enviado: r.ok, motivo: r.ok ? 'ok' : 'http', status: r.status };
}

// Flag ausente ou diferente de on/1/true = desligada. Não consulta o banco.
export async function enviarBoasVindasNovaInscricao(env, registro, fetchImpl = fetch) {
  if (!whatsappBoasVindasLigado(env)) return { enviado: false, motivo: 'desligado' };
  return enviarTextoWuzapi({
    baseUrl: env && env.WUZAPI_BASE_URL,
    token: env && env.WUZAPI_TOKEN,
    phone: registro && registro.whatsapp,
    text: textoBoasVindas(registro && registro.nome),
    fetchImpl,
  });
}

export async function notificarInscricao(env, registro, fetchImpl = fetch) {
  const endpoint = String((env && env.FORMSPREE_ENDPOINT) || FORMSPREE_PADRAO).trim();
  if (!endpoint) return { enviado: false, motivo: 'sem_endpoint' };
  const payload = {
    _subject: 'Comdei: nova inscrição na catequese de adultos',
    destino: NOTIFY_TO,
    nome: registro.nome,
    whatsapp: registro.whatsapp,
    bairro_cidade: registro.bairro_cidade,
    email_inscrito: registro.email || '',
    batizado: registro.batizado,
    primeira_comunhao: registro.primeira_comunhao,
    aviso_privacidade_versao: registro.aviso_privacidade_versao,
    aviso_privacidade_aceito_em: registro.aviso_privacidade_aceito_em,
  };
  if (registro.email) payload.email = registro.email;
  let r;
  try {
    r = await fetchImpl(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    return { enviado: false, motivo: 'rede' };
  }
  return { enviado: r.ok, motivo: r.ok ? 'ok' : 'http', status: r.status };
}

// Monta os parâmetros nomeados da RPC (p_*). consent_at, created_at, expires_at, msg_optin_version e msg_optin_at são do banco.
export function paramsRpc(registro) {
  const p = {};
  for (const k of ['nome', 'whatsapp', 'bairro_cidade', 'email', 'batizado', 'primeira_comunhao', 'como_soube', 'como_soube_outro',
    'maior_18', 'consent_version', 'aviso_privacidade_versao', 'aviso_privacidade_aceito_em',
    'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'referrer', 'ip_hash']) p['p_' + k] = registro[k] ?? null;
  p.p_msg_optin = registro.msg_optin === true; // nunca manda versão/data do cliente
  return p;
}

async function chamarRpc(env, registro) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  const headers = { apikey: key, 'content-type': 'application/json', accept: 'application/json' };
  // chave legada (JWT eyJ...) também vai no Authorization; chave nova sb_secret_ só no apikey
  if (key.startsWith('eyJ')) headers.authorization = `Bearer ${key}`;
  const url = `${String(env.SUPABASE_URL).replace(/\/+$/, '')}/rest/v1/rpc/${RPC}`;
  let host = '?'; try { host = new URL(url).host; } catch {}
  // log de erro sem dados pessoais nem chave: só host, status e mensagem técnica do gateway
  const diag = (o) => console.log(JSON.stringify({ evt: 'catequese_adultos_espera', evento: 'rpc_diag', host, ...o }));
  let r;
  try { r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(paramsRpc(registro)) }); }
  catch (e) { diag({ status: 0, erro_nome: e && e.name, erro_msg: String(e && e.message).slice(0, 200) }); return { ok: false, status: 0 }; }
  let j = null; try { j = await r.json(); } catch {}
  if (!r.ok || !(j && j.ok)) diag({ status: r.status, ct: r.headers.get('content-type'), server: r.headers.get('server'), cf_ray: r.headers.get('cf-ray'), proxy_status: r.headers.get('proxy-status'), pg_code: j && j.code, j_ok: !!(j && j.ok), j_msg: j && String(j.message || j.msg || j.error || '').slice(0, 160), j_hint: j && String(j.hint || '').slice(0, 160) });
  return { ok: r.ok && !!(j && j.ok), status: r.status, duplicado: !!(j && j.duplicado) };
}

export const onRequestPost = ({ request, env }) => handle(request, env);
export const onRequest = ({ request, env }) => (request.method === 'POST' ? handle(request, env) : json({ ok: false, erro: 'metodo' }, 405));
