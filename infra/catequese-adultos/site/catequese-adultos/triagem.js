// Conversa rápida (triagem) da catequese de adultos.
// Tudo roda no navegador: nada é enviado ao servidor, nada é gravado.
// No fim o botão leva ao formulário (#inscricao).
(function () {
  'use strict';
  var P = [
    { k: 'maior_18', q: 'Você tem 18 anos ou mais?', o: [['sim', 'Sim'], ['nao', 'Não']] },
    { k: 'busca', q: 'O que você procura?', o: [['batismo', 'Batismo'], ['primeira_comunhao', 'Primeira comunhão'], ['crisma', 'Crisma'], ['nao_sei', 'Ainda não sei']] },
    { k: 'batizado', q: 'Já é batizado(a)?', o: [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']] },
    { k: 'primeira_comunhao', q: 'Fez a primeira comunhão?', o: [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']] },
    { k: 'horario', q: 'Qual horário fica melhor para os encontros?', o: [['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['fim_semana', 'Fim de semana']] }
  ];
  var chat = document.getElementById('tri-chat'), op = document.getElementById('tri-opcoes');
  var env = document.getElementById('tri-enviar'), rei = document.getElementById('tri-reiniciar');
  if (!chat || !op || !env || !rei) return;
  var i;
  function bolha(t, quem) { var d = document.createElement('p'); d.className = 'b ' + quem; d.textContent = t; chat.appendChild(d); }
  function passo() {
    op.innerHTML = '';
    if (i >= P.length) return fim();
    var p = P[i]; bolha(p.q, 'nos');
    p.o.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o[1];
      b.addEventListener('click', function () {
        bolha(o[1], 'voce');
        if (p.k === 'maior_18' && o[0] === 'nao') return menor();
        i++; passo();
      });
      op.appendChild(b);
    });
    var f = op.querySelector('button'); if (f && i > 0) f.focus();
  }
  function menor() {
    op.innerHTML = '';
    bolha('Esta turma é só para adultos. Para menores, há crisma infantil aos sábados, às 11h.', 'nos');
    env.hidden = true; rei.hidden = false;
  }
  function fim() {
    bolha('Pronto. Para entrar na lista, use o formulário de inscrição. Nada do que você respondeu aqui foi guardado.', 'nos');
    env.href = '#inscricao';
    env.hidden = false; rei.hidden = false;
  }
  function inicio() { i = 0; chat.innerHTML = ''; env.hidden = true; rei.hidden = true; passo(); }
  rei.addEventListener('click', inicio);
  inicio();
})();
