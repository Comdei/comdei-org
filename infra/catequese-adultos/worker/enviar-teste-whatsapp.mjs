#!/usr/bin/env node
// Uma mensagem de teste, para um número digitado agora.
// Não lê o banco, não percorre inscrições e não reenvia para quem já entrou.
// A flag WHATSAPP_BOAS_VINDAS não entra aqui: este comando é o teste anterior a ligá-la.
//
// Uso (não rode sem querer; --confirmar é obrigatório):
//   WUZAPI_BASE_URL e WUZAPI_TOKEN no ambiente, sem colocar os valores no código.
//   node enviar-teste-whatsapp.mjs --confirmar --numero 55DDDNUMERO --nome "Nome"
import { pathToFileURL } from 'node:url';
import { enviarTextoWuzapi, textoBoasVindas } from '../functions/api/catequese-adultos-espera.js';

const PROIBIDOS = ['--backfill', '--todos', '--arquivo', '--existentes'];

function uso() {
  return 'Uso: node enviar-teste-whatsapp.mjs --confirmar --numero 55DDDNUMERO --nome "Nome"\n'
    + 'Envia uma mensagem só. Não consulta inscrições já gravadas.\n'
    + 'Exige WUZAPI_BASE_URL e WUZAPI_TOKEN no ambiente.';
}

export function pedidoDoArgv(argv, env) {
  if (argv.some((a) => PROIBIDOS.includes(a))) {
    return { erro: 'Este comando não percorre inscrições já gravadas.', codigo: 2 };
  }
  if (!argv.includes('--confirmar')) return { erro: uso(), codigo: 2 };
  const numero = argDe(argv, '--numero');
  const nome = argDe(argv, '--nome');
  const digitos = String(numero).replace(/\D/g, '');
  if (!/^55\d{10,11}$/.test(digitos)) return { erro: 'Informe um número com DDI 55 e DDD, uma vez só.', codigo: 2 };
  if (nome.trim().length < 2) return { erro: 'Informe --nome com pelo menos 2 letras.', codigo: 2 };
  const baseUrl = String((env && env.WUZAPI_BASE_URL) || '').trim();
  const token = String((env && env.WUZAPI_TOKEN) || '').trim();
  if (!baseUrl || !token) return { erro: 'Defina WUZAPI_BASE_URL e WUZAPI_TOKEN no ambiente. Não grave os valores no repositório.', codigo: 2 };
  return { digitos, texto: textoBoasVindas(nome), baseUrl, token };
}

function argDe(argv, nome) {
  const i = argv.indexOf(nome);
  if (i < 0) return '';
  const valor = argv[i + 1];
  return valor && !valor.startsWith('--') ? valor : '';
}

async function main() {
  const pedido = pedidoDoArgv(process.argv, process.env);
  if (pedido.erro) {
    console.error(pedido.erro);
    process.exit(pedido.codigo);
  }
  const r = await enviarTextoWuzapi({
    baseUrl: pedido.baseUrl,
    token: pedido.token,
    phone: pedido.digitos,
    text: pedido.texto,
  });
  if (!r.enviado) {
    console.error('Não enviou. motivo=' + r.motivo + (r.status ? ' status=' + r.status : ''));
    process.exit(1);
  }
  console.log('Uma mensagem de teste enviada.');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
