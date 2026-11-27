// Regra única da conversa rápida e do formulário da catequese de adultos.
// Fonte compartilhada: o navegador carrega como módulo (<script type="module">),
// o node (testes) e o Worker importam o mesmo arquivo. Sem build, sem rede, sem armazenamento:
// funções puras sobre valores em memória.
//
// Regra de base: o batismo é a porta dos outros sacramentos. Quem não é batizado não fez a
// primeira comunhão; quem procura a primeira comunhão ainda não a fez.

export const SIMNAO = [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']];
export const BUSCA = [['batismo', 'Batismo'], ['primeira_comunhao', 'Primeira comunhão'], ['crisma', 'Crisma'], ['nao_sei', 'Ainda não sei']];
export const HORARIO = [['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['fim_semana', 'Fim de semana']];

export const PERGUNTAS = {
  maior_18: { q: 'Você tem 18 anos ou mais?', o: [['sim', 'Sim'], ['nao', 'Não']] },
  busca: { q: 'O que você procura?', o: BUSCA },
  batizado: { q: 'Já é batizado(a)?', o: SIMNAO },
  primeira_comunhao: { q: 'Fez a primeira comunhão?', o: SIMNAO },
  horario: { q: 'Qual horário fica melhor para os encontros?', o: HORARIO },
};

export const ACOLHIDA = 'Sem problema: a catequese de adultos prepara para o batismo, a primeira comunhão e a crisma.';

// Mesmo critério no formulário, na conversa e no servidor: "não batizado" => comunhão "não".
export function normalizar(batizado, primeira_comunhao) {
  if (batizado === 'nao') return { batizado, primeira_comunhao: 'nao' };
  return { batizado, primeira_comunhao };
}

// Recebe as respostas até agora ({maior_18, busca, batizado, primeira_comunhao, horario}, todas opcionais)
// e devolve a próxima pergunta, ou pergunta = null quando acabou.
//   { pergunta, q, o }                      próxima pergunta (chave, texto, opções)
//   { pergunta: null, menor: true }         quem não tem 18 anos: nada é preenchido
//   { pergunta: null, valores }             fim: valores normalizados para o formulário
//   acolhida: true quando quem procura comunhão ou crisma respondeu que não é batizado
export function proxima(respostas) {
  const r = respostas || {};
  const val = (k) => (PERGUNTAS[k].o.some((x) => x[0] === r[k]) ? r[k] : undefined);
  const ask = (k, extra) => ({ pergunta: k, q: PERGUNTAS[k].q, o: PERGUNTAS[k].o, acolhida: false, ...extra });

  const maior = val('maior_18');
  if (maior === 'nao') return { pergunta: null, menor: true, acolhida: false, valores: {} };
  if (!maior) return ask('maior_18');

  const busca = val('busca');
  if (!busca) return ask('busca');

  let batizado = busca === 'batismo' ? 'nao' : val('batizado');
  if (!batizado) return ask('batizado');
  const acolhida = (busca === 'primeira_comunhao' || busca === 'crisma') && batizado === 'nao';

  let comunhao;
  if (busca === 'primeira_comunhao' || batizado === 'nao') comunhao = 'nao';
  else {
    comunhao = val('primeira_comunhao');
    if (!comunhao) return ask('primeira_comunhao', { acolhida });
  }
  ({ batizado, primeira_comunhao: comunhao } = normalizar(batizado, comunhao));

  const horario = val('horario');
  if (!horario) return ask('horario', { acolhida });
  return { pergunta: null, acolhida, valores: { maior_18: true, busca, batizado, primeira_comunhao: comunhao, horario } };
}
