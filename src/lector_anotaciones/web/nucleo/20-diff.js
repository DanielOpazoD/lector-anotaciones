// Núcleo · diferencias palabra por palabra entre dos versiones de un bloque. Sin DOM.
(function (raiz, crear) {
  var N = (raiz.LANucleo = raiz.LANucleo || {}),
    m = crear(N);
  Object.keys(m).forEach(function (k) {
    N[k] = m[k];
  });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';
  // Subsecuencia común más larga sobre palabras y espacios; devuelve tramos [op, texto] con op '=', '-' o '+'.
  // Por encima de 250 000 celdas no compara: devuelve el bloque viejo entero quitado y el nuevo añadido.
  function diffPalabras(a, b) {
    var A = a.split(/(\s+)/).filter(function (x) {
        return x !== '';
      }),
      B = b.split(/(\s+)/).filter(function (x) {
        return x !== '';
      });
    if (A.length * B.length > 250000)
      return [
        ['-', a],
        ['+', b],
      ];
    var n = A.length,
      m = B.length,
      L = [],
      i,
      j;
    for (i = 0; i <= n; i++) {
      L.push(new Uint16Array(m + 1));
    }
    for (i = n - 1; i >= 0; i--)
      for (j = m - 1; j >= 0; j--) L[i][j] = A[i] === B[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    var out = [];
    i = 0;
    j = 0;
    var push = function (op, t) {
      if (out.length && out[out.length - 1][0] === op) out[out.length - 1][1] += t;
      else out.push([op, t]);
    };
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
    return out;
  }
  return { diffPalabras: diffPalabras };
});
