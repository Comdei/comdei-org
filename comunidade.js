// Link de convite da Comunidade Comdei no WhatsApp.
// Quando o link existir, troque SÓ a linha abaixo (ex.: "https://chat.whatsapp.com/XXXX").
var COMDEI_COMUNIDADE_URL = "https://chat.whatsapp.com/Il31VgeR7qxCis2l0i9qpT";

(function () {
  var fallback = "https://wa.me/5521981454569?text=Quero%20entrar%20na%20comunidade%20da%20Comdei%20no%20WhatsApp";
  var links = document.querySelectorAll("[data-comunidade]");
  for (var i = 0; i < links.length; i++) links[i].href = COMDEI_COMUNIDADE_URL || fallback;
})();
