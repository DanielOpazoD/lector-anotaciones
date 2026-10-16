// ------------------------------------------------------------ ajustes de lectura
// Tamaño del texto, tema y tipografía. Son de este navegador y valen para todos los libros. El tema elegido va en su
// propio atributo (data-tema-lector) para no pisar el data-theme que pueda poner la página anfitriona.
// fuera del espacio de claves de los libros («lector-anotaciones:<id>»): un libro con id «ajustes» no lo pisa
(function (P, E) {
  var AJUSTES_KEY = 'lector-anotaciones.ajustes',
    ESCALAS = [0.85, 0.92, 1, 1.1, 1.2, 1.32, 1.45];
  var ajustes = (function () {
    try {
      return JSON.parse(P.lsGet(AJUSTES_KEY) || '{}') || {};
    } catch (e) {
      return {};
    }
  })();
  function aplicarAjustes() {
    var raiz = document.documentElement,
      i = ESCALAS.indexOf(ajustes.escala);
    if (i < 0) {
      ajustes.escala = 1;
      i = ESCALAS.indexOf(1);
    }
    raiz.style.setProperty('--escala', String(ajustes.escala));
    if (ajustes.tema === 'light' || ajustes.tema === 'dark') raiz.setAttribute('data-tema-lector', ajustes.tema);
    else raiz.removeAttribute('data-tema-lector');
    if (ajustes.letra === 'sans') raiz.setAttribute('data-letra', 'sans');
    else raiz.removeAttribute('data-letra');
    P.$('#aj-tam').textContent = Math.round(ajustes.escala * 100) + ' %';
    // aria-disabled y no disabled: el botón que llega al tope conserva el foco
    P.$('#aj-menos').setAttribute('aria-disabled', i <= 0 ? 'true' : 'false');
    P.$('#aj-mas').setAttribute('aria-disabled', i >= ESCALAS.length - 1 ? 'true' : 'false');
    P.$$('input[name="aj-tema"]').forEach(function (r) {
      r.checked = r.value === (ajustes.tema || '');
    });
    P.$$('input[name="aj-letra"]').forEach(function (r) {
      r.checked = r.value === (ajustes.letra || '');
    });
  }
  function cambiarAjuste(clave, valor) {
    ajustes[clave] = valor;
    P.lsSet(AJUSTES_KEY, JSON.stringify(ajustes));
    aplicarAjustes();
  }
  function pasoEscala(d) {
    var i = ESCALAS.indexOf(ajustes.escala),
      j = Math.max(0, Math.min(ESCALAS.length - 1, i + d));
    if (j !== i) cambiarAjuste('escala', ESCALAS[j]);
  }
  P.$('#aj-menos').addEventListener('click', function () {
    pasoEscala(-1);
  });
  P.$('#aj-mas').addEventListener('click', function () {
    pasoEscala(1);
  });
  P.$$('input[name="aj-tema"]').forEach(function (r) {
    r.addEventListener('change', function () {
      if (r.checked) cambiarAjuste('tema', r.value);
    });
  });
  P.$$('input[name="aj-letra"]').forEach(function (r) {
    r.addEventListener('change', function () {
      if (r.checked) cambiarAjuste('letra', r.value);
    });
  });
  aplicarAjustes();
})(LAPagina, LAEstado);
