// Rode com: node infra/catequese-adultos/functions/api/regra.test.mjs
// Regra única da conversa rápida e do formulário: site/catequese-adultos/regra.js
import assert from 'node:assert/strict';
import { proxima, normalizar, PERGUNTAS, ACOLHIDA, BUSCA, HORARIO } from '../../site/catequese-adultos/regra.js';

const SIMNAO = ['sim', 'nao', 'nao_sei'];

// Percorre a regra respondendo e devolve as perguntas feitas e o resultado final.
function percorrer(respostas) {
  const r = {};
  const feitas = [];
  let acolhidas = 0;
  for (let i = 0; i < 10; i++) {
    const p = proxima(r);
    if (p.acolhida && feitas[feitas.length - 1] === 'batizado') acolhidas++;
    if (!p.pergunta) return { feitas, valores: p.valores, menor: !!p.menor, acolhidas };
    feitas.push(p.pergunta);
    assert.ok(p.q && p.o.length, 'pergunta tem texto e opções');
    assert.ok(p.pergunta in respostas, 'resposta prevista para ' + p.pergunta);
    r[p.pergunta] = respostas[p.pergunta];
  }
  throw new Error('regra não terminou');
}

// Caso real das capturas: Sim -> Primeira comunhão -> Não. Não pergunta comunhão.
{
  const x = percorrer({ maior_18: 'sim', busca: 'primeira_comunhao', batizado: 'nao', horario: 'noite' });
  assert.deepEqual(x.feitas, ['maior_18', 'busca', 'batizado', 'horario']);
  assert.equal(x.valores.batizado, 'nao');
  assert.equal(x.valores.primeira_comunhao, 'nao');
  assert.equal(x.valores.maior_18, true);
  assert.equal(x.acolhidas, 1);
}

// Linha 1: Batismo. Não pergunta batizado nem comunhão.
{
  const x = percorrer({ maior_18: 'sim', busca: 'batismo', horario: 'manha' });
  assert.deepEqual(x.feitas, ['maior_18', 'busca', 'horario']);
  assert.equal(x.valores.batizado, 'nao');
  assert.equal(x.valores.primeira_comunhao, 'nao');
  assert.equal(x.acolhidas, 0);
}

// Linha 2: Primeira comunhão. Batizado Sim / Não / Não sei, comunhão nunca perguntada, vale Não.
for (const b of SIMNAO) {
  const x = percorrer({ maior_18: 'sim', busca: 'primeira_comunhao', batizado: b, horario: 'tarde' });
  assert.deepEqual(x.feitas, ['maior_18', 'busca', 'batizado', 'horario']);
  assert.equal(x.valores.batizado, b);
  assert.equal(x.valores.primeira_comunhao, 'nao');
  assert.equal(x.acolhidas, b === 'nao' ? 1 : 0);
}

// Linhas 3 a 5: Crisma e Ainda não sei.
for (const busca of ['crisma', 'nao_sei']) {
  for (const c of SIMNAO) {
    const x = percorrer({ maior_18: 'sim', busca, batizado: 'sim', primeira_comunhao: c, horario: 'noite' });
    assert.deepEqual(x.feitas, ['maior_18', 'busca', 'batizado', 'primeira_comunhao', 'horario']);
    assert.equal(x.valores.batizado, 'sim');
    assert.equal(x.valores.primeira_comunhao, c);
    assert.equal(x.acolhidas, 0);

    const y = percorrer({ maior_18: 'sim', busca, batizado: 'nao_sei', primeira_comunhao: c, horario: 'noite' });
    assert.deepEqual(y.feitas, ['maior_18', 'busca', 'batizado', 'primeira_comunhao', 'horario']);
    assert.equal(y.valores.batizado, 'nao_sei');
    assert.equal(y.valores.primeira_comunhao, c);
  }
  const z = percorrer({ maior_18: 'sim', busca, batizado: 'nao', horario: 'noite' });
  assert.deepEqual(z.feitas, ['maior_18', 'busca', 'batizado', 'horario']);
  assert.equal(z.valores.batizado, 'nao');
  assert.equal(z.valores.primeira_comunhao, 'nao');
  assert.equal(z.acolhidas, busca === 'crisma' ? 1 : 0); // "Ainda não sei" não é pedido de crisma nem de comunhão
}

// Menor de idade: nada é preenchido.
{
  const x = percorrer({ maior_18: 'nao' });
  assert.deepEqual(x.feitas, ['maior_18']);
  assert.equal(x.menor, true);
  assert.deepEqual(x.valores, {});
}

// Invariante em TODOS os caminhos possíveis: nunca "não batizado" com comunhão feita,
// e nunca pergunta de comunhão a quem não é batizado ou procura a primeira comunhão.
{
  let caminhos = 0;
  (function andar(r) {
    const p = proxima(r);
    if (!p.pergunta) {
      caminhos++;
      if (p.menor) return;
      const v = p.valores;
      if (v.batizado === 'nao') assert.equal(v.primeira_comunhao, 'nao', JSON.stringify(r));
      if (v.busca === 'primeira_comunhao') assert.equal(v.primeira_comunhao, 'nao', JSON.stringify(r));
      assert.ok(SIMNAO.includes(v.batizado) && SIMNAO.includes(v.primeira_comunhao), JSON.stringify(r));
      return;
    }
    if (p.pergunta === 'primeira_comunhao') {
      assert.notEqual(r.batizado, 'nao', 'perguntou comunhão a não batizado: ' + JSON.stringify(r));
      assert.notEqual(r.busca, 'primeira_comunhao', 'perguntou comunhão a quem procura a comunhão');
      assert.notEqual(r.busca, 'batismo');
    }
    for (const [valor] of p.o) andar({ ...r, [p.pergunta]: valor });
  })({});
  assert.ok(caminhos > 20);
}

// Resposta fora das opções conta como não respondida (a pergunta volta).
assert.equal(proxima({ maior_18: 'talvez' }).pergunta, 'maior_18');
assert.equal(proxima({ maior_18: 'sim', busca: 'x' }).pergunta, 'busca');

// A função não altera o que recebe.
{
  const r = Object.freeze({ maior_18: 'sim', busca: 'crisma', batizado: 'nao' });
  assert.doesNotThrow(() => proxima(r));
}

// normalizar: o mesmo critério usado pelo formulário e pelo servidor.
assert.deepEqual(normalizar('nao', ''), { batizado: 'nao', primeira_comunhao: 'nao' });
assert.deepEqual(normalizar('nao', 'sim'), { batizado: 'nao', primeira_comunhao: 'nao' });
assert.deepEqual(normalizar('nao', undefined), { batizado: 'nao', primeira_comunhao: 'nao' });
assert.deepEqual(normalizar('sim', 'sim'), { batizado: 'sim', primeira_comunhao: 'sim' });
assert.deepEqual(normalizar('nao_sei', 'nao'), { batizado: 'nao_sei', primeira_comunhao: 'nao' });
assert.deepEqual(normalizar('', ''), { batizado: '', primeira_comunhao: '' });

// Textos
assert.equal(ACOLHIDA, 'Sem problema: a catequese de adultos prepara para o batismo, a primeira comunhão e a crisma.');
assert.deepEqual(BUSCA.map((x) => x[0]), ['batismo', 'primeira_comunhao', 'crisma', 'nao_sei']);
assert.deepEqual(HORARIO.map((x) => x[0]), ['manha', 'tarde', 'noite', 'fim_semana']);
assert.deepEqual(Object.keys(PERGUNTAS), ['maior_18', 'busca', 'batizado', 'primeira_comunhao', 'horario']);

console.log('ok: regra da conversa — tabela de decisão e invariante do batismo');
