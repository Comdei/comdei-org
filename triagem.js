// Conversa rápida (triagem) da catequese de adultos.
// Tudo roda no navegador: nada é enviado ao servidor, nada é gravado, sem cookies nem medição.
// No fim monta um link wa.me com a mensagem pronta; a pessoa decide se envia.
(function () {
  'use strict';
  var NUM = '5521981454569';
  var P = [
    { k: 'maior_18', q: 'Você tem 18 anos ou mais?', o: [['sim', 'Sim'], ['nao', 'Não']] },
    { k: 'busca', q: 'O que você procura?', o: [['batismo', 'Batismo'], ['primeira_comunhao', 'Primeira comunhão'], ['crisma', 'Crisma'], ['nao_sei', 'Ainda não sei']] },
    { k: 'batizado', q: 'Já é batizado(a)?', o: [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']] },
    { k: 'primeira_comunhao', q: 'Fez a primeira comunhão?', o: [['sim', 'Sim'], ['nao', 'Não'], ['nao_sei', 'Não sei']] },
    { k: 'horario', q: 'Qual horário fica melhor para os encontros?', o: [['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite'], ['fim_semana', 'Fim de semana']] }
  ];
  var chat = document.getElementById('tri-chat'), op = document.getElementById('tri-opcoes');
  var env = document.getElementById('tri-enviar'), rei = document.getElementById('tri-reiniciar');
  if (!chat || !op) return;
  var r, i;
  function bolha(t, quem) { var d = document.createElement('p'); d.className = 'b ' + quem; d.textContent = t; chat.appendChild(d); }
  function rot(p, v) { for (var j = 0; j < p.o.length; j++) if (p.o[j][0] === v) return p.o[j][1]; return v; }
  function passo() {
    op.innerHTML = '';
    if (i >= P.length) return fim();
    var p = P[i]; bolha(p.q, 'nos');
    p.o.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o[1];
      b.addEventListener('click', function () {
        r[p.k] = o[0]; bolha(o[1], 'voce');
        if (p.k === 'maior_18' && o[0] === 'nao') return menor();
        i++; passo();
      });
      op.appendChild(b);
    });
    var f = op.querySelector('button'); if (f && i > 0) f.focus();
  }
  function menor() {
    op.innerHTML = '';
    bolha('Esta turma é só para adultos. Para menores, há crisma infantil aos sábados, às 11h. Um responsável pode falar com a gente pelo WhatsApp.', 'nos');
    env.hidden = true; rei.hidden = false;
  }
  function fim() {
    bolha('Pronto! Toque no botão abaixo para enviar suas respostas pelo WhatsApp. Se preferir, preencha também o formulário acima.', 'nos');
    var t = 'Olá! Quero participar da catequese de adultos na Lapa dos Mercadores.\n' +
      'Procuro: ' + rot(P[1], r.busca) + '\n' +
      'Batizado(a): ' + rot(P[2], r.batizado) + '\n' +
      'Primeira comunhão: ' + rot(P[3], r.primeira_comunhao) + '\n' +
      'Melhor horário: ' + rot(P[4], r.horario);
    env.href = 'https://wa.me/' + NUM + '?text=' + encodeURIComponent(t);
    env.hidden = false; rei.hidden = false;
  }
  function inicio() { r = {}; i = 0; chat.innerHTML = ''; env.hidden = true; rei.hidden = true; passo(); }
  rei.addEventListener('click', inicio);
  inicio();
})();
