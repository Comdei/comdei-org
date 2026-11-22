import { normalizar } from './regra.js';

(function () {
  'use strict';
  var CONSENT_VERSION = 'lgpd-v2';
  // PROVISIONAL: igual ao aviso acima do botão; pendente de aprovação do Lucas.
  var AVISO_PRIVACIDADE_VERSAO = 'aviso-privacidade-v0';
  var ENDPOINT = '/api/catequese-adultos-espera';
  var UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
  var f = document.getElementById('f');
  document.getElementById('cv').textContent = CONSENT_VERSION;
  document.getElementById('av').textContent = AVISO_PRIVACIDADE_VERSAO;

  var wa = document.getElementById('whatsapp');
  function digits(v) { var d = v.replace(/\D/g, ''); if (d.length > 11 && d.indexOf('55') === 0) d = d.slice(2); return d.slice(0, 11); }
  function mask(d) {
    if (d.length <= 2) return d.length ? '(' + d : '';
    var ddd = '(' + d.slice(0, 2) + ') ', r = d.slice(2);
    if (d.length <= 6) return ddd + r;
    if (d.length <= 10) return ddd + r.slice(0, 4) + '-' + r.slice(4);
    return ddd + r.slice(0, 5) + '-' + r.slice(5);
  }
  function waValido(d) {
    if (d.length !== 10 && d.length !== 11) return false;
    if (d[0] === '0' || d[1] === '0') return false;
    if (d.length === 11 && d[2] !== '9') return false;
    if (d.length === 10 && !/[2-5]/.test(d[2])) return false;
    return !/^(\d)\1+$/.test(d.slice(2));
  }
  wa.addEventListener('input', function () { wa.value = mask(digits(wa.value)); });

  var cs = document.getElementById('como_soube'), ob = document.getElementById('outro-box');
  cs.addEventListener('change', function () { ob.hidden = cs.value !== 'outro'; });

  function setErr(name, msg) {
    var e = document.getElementById('e-' + name); if (e) e.textContent = msg || '';
    var el = f.elements[name]; if (el && el.setAttribute) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function radio(n) { var c = f.querySelector('input[name="' + n + '"]:checked'); return c ? c.value : ''; }

  // Mesma regra da conversa e do servidor (regra.js): quem não é batizado não fez a primeira comunhão.
  // Com batizado = Não o grupo some, sai da validação e segue como "nao". Se a resposta mudar, o grupo volta vazio.
  var gCom = document.getElementById('g-primeira_comunhao');
  function atualizaGrupoComunhao() {
    var naoBatizado = radio('batizado') === 'nao';
    if (naoBatizado && !gCom.hidden) {
      Array.prototype.forEach.call(gCom.querySelectorAll('input[type=radio]'), function (r) { r.checked = false; });
      setErr('primeira_comunhao', '');
      gCom.hidden = true;
    } else if (!naoBatizado && gCom.hidden) {
      gCom.hidden = false;
    }
  }
  f.addEventListener('change', function (ev) { if (ev.target && ev.target.name === 'batizado') atualizaGrupoComunhao(); });

  function validar(d) {
    var e = {};
    if (d.nome.length < 2) e.nome = 'Informe seu nome.';
    if (!waValido(digits(d.whatsapp))) e.whatsapp = 'Informe um WhatsApp válido com DDD.';
    if (d.bairro_cidade.length < 2) e.bairro_cidade = 'Informe seu bairro ou cidade.';
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(d.email)) e.email = 'E-mail inválido (ou deixe em branco).';
    if (!d.batizado) e.batizado = 'Escolha uma opção.';
    if (!d.primeira_comunhao && d.batizado !== 'nao') e.primeira_comunhao = 'Escolha uma opção.';
    if (d.como_soube === 'outro' && !d.como_soube_outro) e.como_soube_outro = 'Conte como soube.';
    if (!d.maior_18) e.maior_18 = 'Confirme que tem 18 anos ou mais.';
    if (!d.consentimento) e.consentimento = 'Precisamos do seu consentimento.';
    return e;
  }

  var qs = new URLSearchParams(location.search);
  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    atualizaGrupoComunhao();
    var sac = normalizar(radio('batizado'), gCom.hidden ? '' : radio('primeira_comunhao'));
    var d = {
      nome: f.nome.value.trim(), whatsapp: f.whatsapp.value, bairro_cidade: f.bairro_cidade.value.trim(),
      email: f.email.value.trim(), batizado: sac.batizado, primeira_comunhao: sac.primeira_comunhao,
      busca: f.busca.value, horario: f.horario.value,
      como_soube: cs.value, como_soube_outro: cs.value === 'outro' ? f.como_soube_outro.value.trim() : '',
      maior_18: f.maior_18.checked, consentimento: f.consentimento.checked, consent_version: CONSENT_VERSION,
      aviso_privacidade_versao: AVISO_PRIVACIDADE_VERSAO,
      website: f.website.value, referrer: document.referrer || ''
    };
    UTM.forEach(function (k) { d[k] = qs.get(k) || ''; });
    ['nome','whatsapp','bairro_cidade','email','batizado','primeira_comunhao','busca','horario','como_soube','como_soube_outro','maior_18','consentimento','geral'].forEach(function (k) { setErr(k, ''); });
    var e = validar(d), ks = Object.keys(e);
    if (ks.length) { ks.forEach(function (k) { setErr(k, e[k]); }); var first = f.elements[ks[0]]; if (first && first.focus) first.focus(); else if (first && first[0]) first[0].focus(); return; }
    var btn = document.getElementById('enviar'); btn.disabled = true; btn.textContent = 'Enviando…';
    fetch(ENDPOINT, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(d) })
      .then(function (r) { return r.json().then(function (j) { return { s: r.status, j: j }; }); })
      .then(function (res) {
        if (res.j && res.j.ok) {
          f.hidden = true; var ok = document.getElementById('ok'); ok.hidden = false;
          if (window.posthog && typeof window.posthog.capture === 'function') {
            window.posthog.capture('catequese_adultos_inscricao', { resultado: 'ok', dry_run: !!res.j.dry_run });
          }
          if (res.j.dry_run) document.getElementById('ok-dry').hidden = false; ok.focus(); return;
        }
        // erro de campo sem lugar próprio (ex.: texto desatualizado, "Recarregue a página") vai para a mensagem geral
        if (res.j && res.j.erros) Object.keys(res.j.erros).forEach(function (k) { setErr(document.getElementById('e-' + k) ? k : 'geral', res.j.erros[k]); });
        else setErr('geral', res.s === 429 ? 'Muitas tentativas. Tente de novo em alguns minutos.' : 'Não deu certo. Tente de novo.');
      })
      .catch(function () { setErr('geral', 'Sem conexão. Tente de novo.'); })
      .finally(function () { btn.disabled = false; btn.textContent = 'Entrar na lista de espera'; });
  });
})();
