// Conversa rápida (triagem) da catequese de adultos.
// As perguntas e a regra vêm de regra.js (a mesma do formulário e do servidor).
// As respostas vivem só na memória da página (variável r): nada de armazenamento, rede ou medição.
// No fim a conversa preenche o formulário, que a pessoa confere e corrige; só é guardado o que ela enviar.
// O consentimento nunca é marcado por ela.
import { proxima, ACOLHIDA } from './regra.js';

(function () {
  'use strict';
  var chat = document.getElementById('tri-chat'), op = document.getElementById('tri-opcoes');
  var env = document.getElementById('tri-enviar'), rei = document.getElementById('tri-reiniciar');
  var form = document.getElementById('f');
  if (!chat || !op || !env || !rei || !form) return;
  var r = {};

  function bolha(t, quem) { var d = document.createElement('p'); d.className = 'b ' + quem; d.textContent = t; chat.appendChild(d); }

  // Marca o campo e avisa o formulário (form.js ouve o "change", por exemplo para esconder a primeira comunhão).
  function avisar(el) { el.dispatchEvent(new Event('change', { bubbles: true })); }
  function marcarRadio(nome, valor) {
    var el = form.querySelector('input[name="' + nome + '"][value="' + valor + '"]');
    if (el) { el.checked = true; avisar(el); }
  }
  function preencher(v) {
    var m = document.getElementById('maior_18'); if (m) { m.checked = true; avisar(m); }
    if (form.busca) { form.busca.value = v.busca; avisar(form.busca); }
    if (form.horario) { form.horario.value = v.horario; avisar(form.horario); }
    marcarRadio('batizado', v.batizado);
    // com "não batizado" o grupo da primeira comunhão não existe: o formulário o esconde e segue como "nao"
    if (v.batizado !== 'nao') marcarRadio('primeira_comunhao', v.primeira_comunhao);
  }

  // foco = true só depois de uma ação da pessoa: o foco nunca fica num botão que sumiu.
  function passo(foco) {
    op.innerHTML = '';
    var p = proxima(r);
    if (p.menor) return menor();
    if (!p.pergunta) return fim(p);
    bolha(p.q, 'nos');
    p.o.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o[1];
      b.addEventListener('click', function () {
        r[p.pergunta] = o[0];
        bolha(o[1], 'voce');
        if (p.pergunta === 'batizado' && proxima(r).acolhida) bolha(ACOLHIDA, 'nos');
        passo(true);
      });
      op.appendChild(b);
    });
    var f = op.querySelector('button'); if (f && foco) f.focus();
  }
  function menor() {
    bolha('Esta turma é só para adultos. Para menores, há crisma infantil aos sábados, às 11h.', 'nos');
    env.hidden = true; rei.hidden = false; rei.focus();
  }
  function fim(p) {
    preencher(p.valores);
    bolha('Pronto. Preenchi o formulário com as suas respostas. Confira, corrija se precisar e marque o consentimento para enviar.', 'nos');
    env.hidden = false; rei.hidden = false; env.focus();
  }
  function inicio(foco) { r = {}; chat.innerHTML = ''; env.hidden = true; rei.hidden = true; passo(foco); }

  env.addEventListener('click', function (ev) {
    var nome = document.getElementById('nome');
    if (!nome) return;
    ev.preventDefault();
    nome.focus();
  });
  rei.addEventListener('click', function () { inicio(true); });
  inicio(false);
})();
