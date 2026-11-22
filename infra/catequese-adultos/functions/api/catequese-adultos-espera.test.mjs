import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AVISO_PRIVACIDADE_VERSAO,
  CONSENT_VERSION,
  TEXTO_BOAS_VINDAS,
  handle,
  paramsRpc,
  validar,
  whatsappBoasVindasLigado,
  textoBoasVindas,
  enviarBoasVindasNovaInscricao,
} from './catequese-adultos-espera.js';
import { pedidoDoArgv } from '../../worker/enviar-teste-whatsapp.mjs';

const TEXTO = 'Olá, {nome}! Aqui é o Lucas, da Comdei. Recebi sua inscrição na catequese de adultos. Quando a turma estiver formada e as datas dos encontros forem marcadas, mando por aqui o link do grupo e o calendário. Se tiver qualquer dúvida, é só responder esta mensagem. Que Deus te abençoe!';

assert.equal(TEXTO_BOAS_VINDAS, TEXTO);
assert.deepEqual(TEXTO_BOAS_VINDAS.match(/\{[^}]+\}/g), ['{nome}']);
assert.equal(TEXTO_BOAS_VINDAS.includes('aulas gravadas'), false);
assert.equal(textoBoasVindas('Pessoa Exemplo'), TEXTO.replace('{nome}', 'Pessoa Exemplo'));
assert.equal(whatsappBoasVindasLigado({}), false);
assert.equal(whatsappBoasVindasLigado({ WHATSAPP_BOAS_VINDAS: 'off' }), false);
assert.equal(whatsappBoasVindasLigado({ WHATSAPP_BOAS_VINDAS: 'on' }), true);

const bloqueado = async () => { throw new Error('rede bloqueada no teste'); };
assert.equal((await enviarBoasVindasNovaInscricao({
  WUZAPI_BASE_URL: 'https://wuzapi.example.test',
  WUZAPI_TOKEN: 'token-de-teste',
}, { nome: 'Pessoa Exemplo', whatsapp: '+5521987654321' }, bloqueado)).motivo, 'desligado');

const vazio = validar({ nome: 'Pessoa Exemplo', bairro_cidade: 'Centro', batizado: 'nao_sei', primeira_comunhao: 'nao_sei', maior_18: true, consentimento: true });
assert.equal(vazio.ok, false);
assert.ok(vazio.erros.whatsapp);

const base = {
  nome: 'Pessoa Exemplo',
  whatsapp: '21987654321',
  bairro_cidade: 'Centro',
  batizado: 'nao_sei',
  primeira_comunhao: 'nao_sei',
  maior_18: true,
  consentimento: true,
  consent_version: 'lgpd-v2',
  aviso_privacidade_versao: AVISO_PRIVACIDADE_VERSAO,
  aviso_privacidade_aceito_em: '1999-01-01T00:00:00.000Z',
  website: '',
};

let n = 0;
function post(body, env) {
  return handle(new Request('https://comdei.org/api/catequese-adultos-espera', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'cf-connecting-ip': `203.0.113.${++n}` },
    body: JSON.stringify(body),
  }), env || {});
}

globalThis.fetch = bloqueado;
const seca = await (await post(base)).json();
assert.equal(seca.ok, true);
assert.equal(seca.dry_run, true);
assert.equal(seca.registro.whatsapp, '+5521987654321');
assert.equal(seca.registro.aviso_privacidade_versao, AVISO_PRIVACIDADE_VERSAO);
assert.match(seca.registro.aviso_privacidade_aceito_em, /^\d{4}-\d{2}-\d{2}T/);
assert.equal(seca.registro.aviso_privacidade_aceito_em.startsWith('1999'), false);
assert.equal(paramsRpc(seca.registro).p_aviso_privacidade_versao, AVISO_PRIVACIDADE_VERSAO);
assert.match(paramsRpc(seca.registro).p_aviso_privacidade_aceito_em, /^\d{4}-\d{2}-\d{2}T/);

const db = {
  SUPABASE_URL: 'https://db.example.test',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_teste',
  IP_HASH_SALT: 'sal-de-teste',
};
function mock(duplicado) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    const u = String(url);
    if (u.includes('/rpc/catequese_adultos_inscrever')) {
      return new Response(JSON.stringify({ ok: true, duplicado }), { status: 200, headers: { 'content-type': 'application/json' } });
    }
    if (u.includes('formspree.io') || u.includes('/chat/send/text')) {
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
    }
    throw new Error('url inesperada ' + u);
  };
  return calls;
}

const semFlag = mock(false);
const gravou = await (await post(base, { ...db, WUZAPI_BASE_URL: 'https://wuzapi.example.test', WUZAPI_TOKEN: 'token-de-teste' })).json();
assert.equal(gravou.ok, true);
assert.equal(gravou.dry_run, false);
assert.equal(semFlag.some((c) => c.url.includes('/chat/send/text')), false);
assert.equal(semFlag.filter((c) => c.url.includes('formspree.io')).length, 1);
const rpc = semFlag.find((c) => c.url.includes('/rpc/'));
const rpcBody = JSON.parse(rpc.init.body);
assert.equal(rpcBody.p_aviso_privacidade_versao, AVISO_PRIVACIDADE_VERSAO);
assert.match(rpcBody.p_aviso_privacidade_aceito_em, /^\d{4}-\d{2}-\d{2}T/);
const mail = JSON.parse(semFlag.find((c) => c.url.includes('formspree.io')).init.body);
assert.equal(mail.destino, 'lucas@comdei.org');
assert.equal(JSON.stringify(mail).includes('aulas gravadas'), false);

const dup = mock(true);
const repetiu = await (await post(base, { ...db, WHATSAPP_BOAS_VINDAS: 'on', WUZAPI_BASE_URL: 'https://wuzapi.example.test', WUZAPI_TOKEN: 'token-de-teste' })).json();
assert.equal(repetiu.ok, true);
assert.equal(dup.length, 1);
assert.equal(dup[0].url.includes('/rpc/'), true);

const ligados = mock(false);
const nova = await (await post(base, { ...db, WHATSAPP_BOAS_VINDAS: 'on', WUZAPI_BASE_URL: 'https://wuzapi.example.test/', WUZAPI_TOKEN: 'token-de-teste' })).json();
assert.equal(nova.ok, true);
const wa = ligados.filter((c) => c.url.includes('/chat/send/text'));
assert.equal(wa.length, 1);
assert.equal(wa[0].url, 'https://wuzapi.example.test/chat/send/text');
assert.equal(wa[0].init.headers.Token, 'token-de-teste');
const enviado = JSON.parse(wa[0].init.body);
assert.equal(enviado.Phone, '5521987654321');
assert.equal(enviado.Body, TEXTO.replace('{nome}', 'Pessoa Exemplo'));
assert.equal(enviado.Body.includes('{'), false);

const semToken = mock(false);
const ainda = await (await post(base, { ...db, WHATSAPP_BOAS_VINDAS: 'on' })).json();
assert.equal(ainda.ok, true);
assert.equal(semToken.some((c) => c.url.includes('/chat/send/text')), false);

// --- lgpd-v2, msg_optin, regra do batismo, busca e horário ---
assert.equal(CONSENT_VERSION, 'lgpd-v2');

// lgpd-v1 (aba antiga) é recusado com a mensagem de recarregar
{
  const res = await post({ ...base, consent_version: 'lgpd-v1' });
  assert.equal(res.status, 422);
  const j = await res.json();
  assert.match(j.erros.consent_version, /Recarregue a página/);
}

// msg_optin vindo do cliente é ignorado; nunca vira true
{
  const j = await (await post({ ...base, msg_optin: true, msg_optin_version: 'lgpd-v1' })).json();
  assert.equal(j.ok, true);
  assert.equal(j.registro.msg_optin, false);
  assert.ok(j.campos_ignorados.includes('msg_optin'));
  assert.equal(paramsRpc(j.registro).p_msg_optin, false);
  assert.equal(paramsRpc({ ...j.registro, msg_optin: true }).p_msg_optin, false);
  const calls = mock(false);
  await post({ ...base, msg_optin: true }, db);
  assert.equal(JSON.parse(calls.find((c) => c.url.includes('/rpc/')).init.body).p_msg_optin, false);
}

// batizado = nao força primeira_comunhao = nao, venha o campo como vier
for (const pc of ['sim', 'nao_sei', 'nao', '', undefined, 'lixo']) {
  const corpo = { ...base, batizado: 'nao' };
  if (pc === undefined) delete corpo.primeira_comunhao; else corpo.primeira_comunhao = pc;
  const j = await (await post(corpo)).json();
  assert.equal(j.ok, true, 'comunhão ' + pc);
  assert.equal(j.registro.batizado, 'nao');
  assert.equal(j.registro.primeira_comunhao, 'nao', 'comunhão ' + pc);
  assert.equal(paramsRpc(j.registro).p_primeira_comunhao, 'nao');
}
{
  // gravação real também recebe nao
  const calls = mock(false);
  await post({ ...base, batizado: 'nao', primeira_comunhao: 'sim' }, db);
  assert.equal(JSON.parse(calls.find((c) => c.url.includes('/rpc/')).init.body).p_primeira_comunhao, 'nao');
}
// quem é batizado ou não sabe continua com a comunhão informada, e ela segue obrigatória
assert.equal((await (await post({ ...base, batizado: 'sim', primeira_comunhao: 'sim' })).json()).registro.primeira_comunhao, 'sim');
assert.equal((await (await post({ ...base, batizado: 'nao_sei', primeira_comunhao: 'nao' })).json()).registro.primeira_comunhao, 'nao');
{
  const res = await post({ ...base, batizado: 'sim', primeira_comunhao: '' });
  assert.equal(res.status, 422);
  assert.ok((await res.json()).erros.primeira_comunhao);
}

// busca e horário: opcionais, validados, gravados pela RPC
{
  const j = await (await post({ ...base, busca: 'crisma', horario: 'fim_semana' })).json();
  assert.equal(j.registro.busca, 'crisma');
  assert.equal(j.registro.horario, 'fim_semana');
  assert.equal(paramsRpc(j.registro).p_busca, 'crisma');
  assert.equal(paramsRpc(j.registro).p_horario, 'fim_semana');
  const vazio2 = await (await post(base)).json();
  assert.equal(vazio2.registro.busca, null);
  assert.equal(vazio2.registro.horario, null);
  assert.equal((await post({ ...base, busca: 'xyz' })).status, 422);
  assert.equal((await post({ ...base, horario: 'madrugada' })).status, 422);
}

// Interface: duas caixas (maioridade e consentimento), sem msg_optin
{
  const html2 = fs.readFileSync(fileURLToPath(new URL('../../site/catequese-adultos/index.html', import.meta.url)), 'utf8');
  const form2 = fs.readFileSync(fileURLToPath(new URL('../../site/catequese-adultos/form.js', import.meta.url)), 'utf8');
  const tri = fs.readFileSync(fileURLToPath(new URL('../../site/catequese-adultos/triagem.js', import.meta.url)), 'utf8');
  const regraSrc = fs.readFileSync(fileURLToPath(new URL('../../site/catequese-adultos/regra.js', import.meta.url)), 'utf8');
  const sql2 = fs.readFileSync(fileURLToPath(new URL('../../migrations/20261122_lgpd_v2_busca_horario.sql', import.meta.url)), 'utf8');
  const worker = fs.readFileSync(fileURLToPath(new URL('./catequese-adultos-espera.js', import.meta.url)), 'utf8');

  assert.deepEqual([...html2.matchAll(/<input type="checkbox" id="([a-z0-9_]+)"/g)].map((m) => m[1]), ['maior_18', 'consentimento']);
  for (const [nome, txt] of [['index.html', html2], ['form.js', form2], ['triagem.js', tri]]) {
    assert.equal(/msg_optin/.test(txt), false, nome + ' ainda menciona msg_optin');
    assert.equal(/lgpd-v1/.test(txt), false, nome + ' ainda menciona lgpd-v1');
  }
  assert.equal(/MSG_OPTIN/.test(worker), false);
  assert.equal(/b\.msg_optin/.test(worker), false);

  // mesma versão em form.js, Worker e migração
  assert.match(form2, /CONSENT_VERSION = 'lgpd-v2'/);
  assert.match(sql2, /'lgpd-v2'/);

  // texto aprovado do consentimento (lgpd-v2), com o acréscimo aprovado para busca e horário
  const TEXTO_V2 = 'Autorizo a Comdei (associação em constituição) a guardar estes dados, inclusive a informação sobre sacramentos, o que procuro na catequese e o horário que prefiro para os encontros, e a falar comigo por WhatsApp e e-mail sobre a catequese de adultos: confirmação da inscrição, formação da turma e avisos dos encontros. Os dados não são compartilhados nem usados para outro fim. Posso pedir para ver, corrigir ou apagar meus dados, ou para parar de receber mensagens, a qualquer momento: respondendo SAIR ou escrevendo para lucas@comdei.org.';
  const m = html2.match(/id="consentimento"[^>]*><span>(.*?)<\/span><\/label>/s);
  assert.ok(m, 'texto do consentimento não encontrado');
  const textoHtml = m[1].replace(/<[^>]+>/g, '');
  assert.equal(textoHtml, TEXTO_V2);
  // hash do catálogo = sha256 do texto exato (UTF-8)
  const hash = createHash('sha256').update(TEXTO_V2, 'utf8').digest('hex');
  assert.ok(sql2.includes(`'${hash}'`), 'hash da migração não bate com o texto do consentimento: ' + hash);

  // textos que deixaram de ser verdade
  for (const velho of ['Nada fica guardado', 'Nada do que você respondeu', 'para os catequistas já saberem', '5 perguntas rápidas', 'mensagens de boas-vindas e lembretes']) {
    assert.equal(html2.includes(velho) || tri.includes(velho) || regraSrc.includes(velho), false, velho);
  }

  // conversa: só memória da página, sem rede nem armazenamento nem PostHog
  for (const proibido of [/localStorage/, /sessionStorage/, /indexedDB/, /fetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /posthog/i, /document\.cookie/]) {
    assert.equal(proibido.test(tri), false, 'triagem.js: ' + proibido);
    assert.equal(proibido.test(regraSrc), false, 'regra.js: ' + proibido);
  }
  assert.match(tri, /from '\.\/regra\.js'/);
  assert.match(form2, /from '\.\/regra\.js'/);
  assert.match(html2, /<script type="module" src="\/catequese-adultos\/form\.js">/);
  assert.match(html2, /<script type="module" src="\/catequese-adultos\/triagem\.js">/);

  // selects de busca e horário no formulário têm os mesmos valores da regra
  const { BUSCA, HORARIO } = await import('../../site/catequese-adultos/regra.js');
  for (const [id, lista] of [['busca', BUSCA], ['horario', HORARIO]]) {
    const sel = html2.match(new RegExp('<select id="' + id + '"[^>]*>(.*?)</select>', 's'));
    assert.ok(sel, 'select ' + id);
    const vals = [...sel[1].matchAll(/<option value="([^"]*)">([^<]*)</g)].filter((x) => x[1]).map((x) => [x[1], x[2]]);
    assert.deepEqual(vals, lista, id);
  }
  assert.match(html2, /<fieldset id="g-primeira_comunhao"/);

  // migração: aditiva, sem UPDATE em inscrições, lgpd-v1 só comentada
  assert.equal(/^\s*update\s+interno\.catequese_adultos_espera/im.test(sql2), false);
  assert.equal(/^\s*delete\s/im.test(sql2), false);
  assert.match(sql2, /NÃO APLICAR daqui/);
  assert.match(sql2, /not valid/i);
  assert.equal(/^\s*update\s+interno\.consent_versions/im.test(sql2), false, 'desativar lgpd-v1 deve ficar comentado');
}

const site = fileURLToPath(new URL('../../site/catequese-adultos/', import.meta.url));
for (const nome of ['index.html', 'form.js', 'triagem.js']) {
  const txt = fs.readFileSync(site + nome, 'utf8');
  assert.equal(txt.includes('wa.me'), false, nome);
  assert.equal(txt.includes('5521981454569'), false, nome);
  assert.equal(txt.includes('aica.guru'), false, nome);
  assert.equal(/podemos entrar em contato por WhatsApp/i.test(txt), false, nome);
}
const html = fs.readFileSync(site + 'index.html', 'utf8');
assert.match(html, /id="whatsapp"[^>]*required/);
assert.match(html, /id="wa-direto"[^>]*href="#inscricao"/);
assert.match(html, /id="tri-enviar"[^>]*href="#inscricao"/);
assert.match(html, /id="inscricao"/);
assert.match(html, /id="ok"/);
assert.match(html, /src="\/analytics\.js"/);
assert.match(html, /PROVISIONAL/);
assert.match(html, /política de privacidade/);
assert.match(html, /Comdei/);
const form = fs.readFileSync(site + 'form.js', 'utf8');
assert.match(form, /catequese_adultos_inscricao/);
assert.equal(/capture\([^)]*nome/.test(form), false);
assert.equal(/capture\([^)]*whatsapp/.test(form), false);
assert.equal(/capture\([^)]*email/.test(form), false);

const sql = fs.readFileSync(fileURLToPath(new URL('../../migrations/20261102_aviso_privacidade.sql', import.meta.url)), 'utf8');
assert.equal(/update\s+interno\.catequese_adultos_espera/i.test(sql), false);
assert.match(sql, /aviso_privacidade_versao/);
assert.match(sql, /aviso_privacidade_aceito_em/);
assert.match(sql, /PROVISIONAL/);

const script = fileURLToPath(new URL('../../worker/enviar-teste-whatsapp.mjs', import.meta.url));
const scriptSrc = fs.readFileSync(script, 'utf8');
assert.equal(/catequese_adultos_espera/.test(scriptSrc), false);
assert.equal(/WUZAPI_TOKEN\s*=\s*['"]/.test(scriptSrc), false);
assert.equal(/WUZAPI_BASE_URL\s*=\s*['"]https?:/.test(scriptSrc), false);
assert.equal(pedidoDoArgv(['node', 'enviar-teste-whatsapp.mjs', '--backfill'], {}).erro.includes('não percorre'), true);
assert.equal(pedidoDoArgv(['node', 'enviar-teste-whatsapp.mjs'], { WUZAPI_BASE_URL: 'https://wuzapi.example.test', WUZAPI_TOKEN: 'token-de-teste' }).codigo, 2);
const pedido = pedidoDoArgv(
  ['node', 'enviar-teste-whatsapp.mjs', '--confirmar', '--numero', '5511987654321', '--nome', 'Pessoa Exemplo'],
  { WUZAPI_BASE_URL: 'https://wuzapi.example.test', WUZAPI_TOKEN: 'token-de-teste' },
);
assert.equal(pedido.digitos, '5511987654321');
assert.equal(pedido.texto, TEXTO.replace('{nome}', 'Pessoa Exemplo'));
assert.equal(Object.hasOwn(pedido, 'token'), true);

const child = spawnSync(process.execPath, [script], { env: { PATH: process.env.PATH }, encoding: 'utf8' });
assert.equal(child.status, 2);
assert.equal(String(child.stdout).includes('token-de-teste'), false);

console.log('ok: catequese adultos — aviso, CTAs, e-mail e WhatsApp só com flag');
