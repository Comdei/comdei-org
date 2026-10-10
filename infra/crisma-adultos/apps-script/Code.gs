/**
 * Apps Script ligado à planilha "Comdei na Lapa — cadastros" (lucas@comdei.org).
 * Recebe só chamadas do Worker (segredo compartilhado) e grava uma linha na aba do formulário.
 * Propriedades do script (Configurações do projeto > Propriedades do script):
 *   SHARED_SECRET = mesmo valor do secret SHEETS_SHARED_SECRET do Worker
 * NÃO implantar sem GO escrito do Lucas.
 */
var PER_IP_PER_HOUR = 5;
var MAX_PER_DAY = 300;
var SACRAMENTO = { sim: 'Sim', nao: 'Não', nao_sei: 'Não sei' };
var TABS = {
  'crisma-adultos': {
    sheet: 'Crisma de adultos',
    header: ['Recebido em', 'Nome', 'WhatsApp', 'E-mail', 'Paróquia', 'Batizado', 'Primeira Comunhão'],
    row: function (b) { return [cell_(b.nome, 120), cell_(b.whatsapp, 13), cell_(b.email, 200), cell_(b.paroquia, 120),
                                SACRAMENTO[b.batizado] || '', SACRAMENTO[b.comunhao] || '']; }
  },
  'catequese-infantil': {
    sheet: 'Catequese infantil',
    header: ['Recebido em', 'Responsável', 'WhatsApp', 'E-mail', 'Idade da criança'],
    row: function (b) { return [cell_(b.nome, 120), cell_(b.whatsapp, 13), cell_(b.email, 200), cell_(b.idade, 40)]; }
  },
  'pergunta': {
    sheet: 'Perguntas',
    header: ['Recebido em', 'Nome', 'WhatsApp', 'E-mail', 'Pergunta'],
    row: function (b) { return [cell_(b.nome, 120), cell_(b.whatsapp, 13), cell_(b.email, 200), cell_(b.pergunta, 1000)]; }
  }
};
var TAIL_HEADER = ['Consentimento', 'Hash do IP', 'Origem', 'Status', 'Observações'];

function reply_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function safeEqual_(a, b) {
  a = String(a || ''); b = String(b || '');
  if (!a || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// Evita injeção de fórmula na planilha (=, +, -, @ no começo da célula).
function cell_(v, max) {
  var s = String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply_({ ok: false, error: 'json' }); }
  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!safeEqual_(body.secret, secret)) return reply_({ ok: false, error: 'auth' });

  var tab = TABS[body.form || 'crisma-adultos'];
  if (!tab) return reply_({ ok: false, error: 'campos' });
  var wa = String(body.whatsapp || '').replace(/\D/g, '');
  if (String(body.nome || '').trim().length < 2 || wa.length < 10 || wa.length > 13) return reply_({ ok: false, error: 'campos' });
  body.whatsapp = wa;

  var cache = CacheService.getScriptCache();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return reply_({ ok: false, error: 'busy' });
  try {
    if (body.ipHash) {
      var k = 'ip:' + String(body.ipHash).slice(0, 64);
      var n = Number(cache.get(k) || '0');
      if (n >= PER_IP_PER_HOUR) return reply_({ ok: false, error: 'rate' });
      cache.put(k, String(n + 1), 3600);
    }
    var day = 'day:' + Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd');
    var total = Number(cache.get(day) || '0');
    if (total >= MAX_PER_DAY) return reply_({ ok: false, error: 'rate' });
    cache.put(day, String(total + 1), 21600);

    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName(tab.sheet) || ss.insertSheet(tab.sheet);
    if (sh.getLastRow() === 0) { sh.appendRow(tab.header.concat(TAIL_HEADER)); sh.setFrozenRows(1); }
    var now = Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss');
    sh.appendRow([now].concat(tab.row(body), ['Sim (checkbox no site)', cell_(body.ipHash, 64), cell_(body.origem, 60), 'Novo', '']));
  } finally {
    lock.releaseLock();
  }
  return reply_({ ok: true });
}

function doGet() {
  return reply_({ ok: false });
}
