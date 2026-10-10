(function () {
  var nav = document.querySelector(".cnav");
  if (!nav) return;
  var btn = nav.querySelector(".cnav-toggle");
  btn.addEventListener("click", function () {
    var open = btn.getAttribute("aria-expanded") === "true";
    btn.setAttribute("aria-expanded", open ? "false" : "true");
    nav.classList.toggle("is-open", !open);
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && nav.classList.contains("is-open")) {
      btn.setAttribute("aria-expanded", "false"); nav.classList.remove("is-open"); btn.focus();
    }
  });
})();
