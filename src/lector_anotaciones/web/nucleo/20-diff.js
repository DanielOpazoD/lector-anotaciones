// Núcleo · diferencias palabra por palabra entre dos versiones de un bloque. Sin DOM.
// La envoltura de cada archivo del núcleo: `crear` recibe el núcleo (con lo de los archivos anteriores) y devuelve lo
// suyo, que se le añade; cada función devuelta se revisa contra su firma en `Nucleo` (tipos/globales.d.ts).
/** @type {(raiz: any, crear: (N: Nucleo) => Partial<Nucleo>) => void} */ (
  function (raiz, crear) {
    var N = /** @type {any} */ (raiz.LANucleo = raiz.LANucleo || {}),
      m = /** @type {any} */ (crear(N));
    Object.keys(m).forEach(function (k) {
      N[k] = m[k];
    });
  }
)(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  // Subsecuencia común más larga sobre palabras y espacios; devuelve tramos [op, texto] con op '=', '-' o '+'. Lo común
  // al principio y al final se aparta antes de comparar (un cambio de una palabra en un párrafo largo cuesta lo que
  // mide el párrafo, no su cuadrado). Si lo que queda en medio pasa de 250 000 celdas, no se compara: sale quitado
  // entero y añadido entero, entre lo común.
  /**
   * @param {string} a
   * @param {string} b
   * @returns {['=' | '-' | '+', string][]}
   */
  function diffPalabras(a, b) {
    var A = a.split(/(\s+)/).filter(function (x) {
        return x !== '';
      }),
      B = b.split(/(\s+)/).filter(function (x) {
        return x !== '';
      });
    var ini = 0;
    while (ini < A.length && ini < B.length && A[ini] === B[ini]) ini++;
    var fa = A.length,
      fb = B.length;
    while (fa > ini && fb > ini && A[fa - 1] === B[fb - 1]) {
      fa--;
      fb--;
    }
    /** @type {['=' | '-' | '+', string][]} */
    var out = [];
    /**
     * @param {'=' | '-' | '+'} op
     * @param {string} t
     */
    var push = function (op, t) {
      if (!t) return;
      if (out.length && out[out.length - 1][0] === op) out[out.length - 1][1] += t;
      else out.push([op, t]);
    };
    push('=', A.slice(0, ini).join(''));
    var sufijo = A.slice(fa).join('');
    A = A.slice(ini, fa);
    B = B.slice(ini, fb);
    var n = A.length,
      m = B.length,
      i,
      j;
    if (n * m > 250000) {
      push('-', A.join(''));
      push('+', B.join(''));
      push('=', sufijo);
      return out;
    }
    var L = [];
    for (i = 0; i <= n; i++) {
      L.push(new Uint16Array(m + 1));
    }
    for (i = n - 1; i >= 0; i--)
      for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    i = 0;
    j = 0;
    while (i < n && j < m) {
      if (A[i] === B[j]) {
        push('=', A[i]);
        i++;
        j++;
      } else if (L[i + 1][j] >= L[i][j + 1]) {
        push('-', A[i]);
        i++;
      } else {
        push('+', B[j]);
        j++;
      }
    }
    while (i < n) {
      push('-', A[i++]);
    }
    while (j < m) {
      push('+', B[j++]);
    }
    push('=', sufijo);
    return out;
  }
  return { diffPalabras: diffPalabras };
});
