// Rode com: node tests/catequese-encontro.test.js
var assert = require("assert");
var fs = require("fs");
var path = require("path");
var f = require("../catequese-encontro.js").catequeseEncontroAtual;

assert.strictEqual(f(Date.parse("2026-10-30T15:00:00-03:00")), "31/10");
assert.strictEqual(f(Date.parse("2026-10-31T10:59:59-03:00")), "31/10");
assert.strictEqual(f(Date.parse("2026-10-31T13:59:59Z")), "31/10"); // mesmo instante em UTC
assert.strictEqual(f(Date.parse("2026-10-31T11:00:00-03:00")), "14/11");
assert.strictEqual(f(Date.parse("2026-10-31T14:00:00Z")), "14/11");
assert.strictEqual(f(Date.parse("2026-10-31T23:00:00+09:00")), "14/11"); // visitante em Tóquio
assert.strictEqual(f(Date.parse("2026-11-20T12:00:00-03:00")), "14/11");

var html = fs.readFileSync(path.join(__dirname, "..", "catequese-infantil.html"), "utf8");
assert.ok(!html.includes("17/10"), "17/10 não pode sobrar no HTML");
assert.strictEqual((html.match(/data-encontro="/g) || []).length, 2);
assert.ok(html.includes(">Sábado, 31/10, às 11h<"));
assert.ok(html.includes(">sábado, 31/10, às 11h<"));
assert.ok(html.includes('src="catequese-encontro.js"'));
console.log("ok: 31/10 antes de 31/10 11h (-03:00), 14/11 a partir daí; HTML sem JS mostra 31/10");
