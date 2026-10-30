// Próximo encontro da catequese infantil.
// O HTML já sai com o encontro de 31/10 (funciona sem JavaScript).
// A partir de 31/10/2026 às 11h no horário de Brasília (-03:00), o navegador
// troca para o encontro seguinte. A comparação usa um instante absoluto,
// então o fuso do visitante não importa. Local e Missa das 12h15 não mudam.
var CATEQUESE_ENCONTROS = [
  { ate: "2026-10-31T11:00:00-03:00", data: "31/10" },
  { ate: null, data: "14/11" }
];

function catequeseEncontroAtual(agoraMs) {
  for (var i = 0; i < CATEQUESE_ENCONTROS.length; i++) {
    var e = CATEQUESE_ENCONTROS[i];
    if (e.ate === null || agoraMs < Date.parse(e.ate)) return e.data;
  }
  return CATEQUESE_ENCONTROS[CATEQUESE_ENCONTROS.length - 1].data;
}

(function () {
  if (typeof document === "undefined") return;
  var data = catequeseEncontroAtual(Date.now());
  var alvos = document.querySelectorAll("[data-encontro]");
  for (var i = 0; i < alvos.length; i++) {
    alvos[i].textContent = alvos[i].getAttribute("data-encontro") + ", " + data + ", às 11h";
  }
})();

if (typeof module !== "undefined") module.exports = { catequeseEncontroAtual: catequeseEncontroAtual };
