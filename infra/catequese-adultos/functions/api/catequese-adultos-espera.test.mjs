import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  AVISO_PRIVACIDADE_VERSAO,
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
  consent_version: 'lgpd-v1',
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
