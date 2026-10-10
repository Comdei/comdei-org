/**
 * Apps Script ligado à planilha "Crisma de adultos — interessados" (lucas@comdei.org).
 * Recebe só chamadas do Worker (segredo compartilhado) e grava uma linha.
 * Propriedades do script (Configurações do projeto > Propriedades do script):
 *   SHARED_SECRET = mesmo valor do secret SHEETS_SHARED_SECRET do Worker
 * NÃO implantar sem GO escrito do Lucas.
 */
var SHEET_NAME = 'Cadastros';
var HEADER = ['Recebido em', 'Nome', 'WhatsApp', 'E-mail', 'Paróquia', 'Batizado', 'Primeira Comunhão',
              'Consentimento', 'Hash do IP', 'Origem', 'Status', 'Observações'];
var PER_IP_PER_HOUR = 5;
var MAX_PER_DAY = 200;
var LIMITS = { nome: 120, whatsapp: 13, email: 200, paroquia: 120 };
var SACRAMENTO = { sim: 'Sim', nao: 'Não', nao_sei: 'Não sei' };

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
  var s = String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function doPost(e) {
  var body;
  try { body = JSON.parse(e.postData.contents); } catch (err) { return reply_({ ok: false, error: 'json' }); }
  var secret = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');
  if (!safeEqual_(body.secret, secret)) return reply_({ ok: false, error: 'auth' });

  if (!SACRAMENTO[body.batizado] || !SACRAMENTO[body.comunhao]) return reply_({ ok: false, error: 'campos' });
  var wa = String(body.whatsapp || '').replace(/\D/g, '');
  if (String(body.nome || '').trim().length < 2 || wa.length < 10 || wa.length > 13) return reply_({ ok: false, error: 'campos' });

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
    var sh = ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
    if (sh.getLastRow() === 0) { sh.appendRow(HEADER); sh.setFrozenRows(1); }
    sh.appendRow([
      Utilities.formatDate(new Date(), 'America/Sao_Paulo', 'yyyy-MM-dd HH:mm:ss'),
      cell_(body.nome, LIMITS.nome),
      cell_(wa, LIMITS.whatsapp),
      cell_(body.email, LIMITS.email),
      cell_(body.paroquia, LIMITS.paroquia),
      SACRAMENTO[body.batizado],
      SACRAMENTO[body.comunhao],
      'Sim (checkbox no site)',
      cell_(body.ipHash, 64),
      cell_(body.origem, 60),
      'Novo',
      ''
    ]);
  } finally {
    lock.releaseLock();
  }
  return reply_({ ok: true });
}

function doGet() {
  return reply_({ ok: false });
}
