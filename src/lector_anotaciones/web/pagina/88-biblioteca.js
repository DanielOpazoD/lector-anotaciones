// ------------------------------------------------------------ biblioteca: el libro de la página y los importados
// Además del libro que viene con la página (libro.json junto a index.html), se pueden importar otros: quedan en la
// biblioteca compartida de la página (colección «libros» de la base, troceados para no pasar del tamaño por
// documento) o sólo en este navegador (IndexedDB). Las anotaciones de un libro importado van aparte, en
// libros/<id>/anotaciones (o en el navegador, si el libro es sólo de este navegador). Cada carga de la página atiende
// un libro: abrir otro recuerda la elección y recarga, para que nada de un libro (escrituras en curso, borradores, la
// cola de pendientes) se cruce con el otro.
// La elección del libro abierto vive fuera del espacio de claves de los libros («lector-anotaciones:<id>…»), y por
// ruta de la página: varias páginas en un mismo sitio no se pisan la elección.
var ABIERTO_KEY = 'lector-anotaciones.abierto:' + location.pathname; // '' = el de la página; 'base:<id>' o 'local:<id>'
var FUENTE = { tipo: 'pagina', id: null };
var PARTE_MAX = 180 * 1024,
  PARTES_MAX = 2000;
var usoDb = window.claude && window.claude.use ? window.claude.use('db') : Promise.resolve(null);
var usoUser = window.claude && window.claude.use ? window.claude.use('user') : Promise.resolve(null);
var libroPagina = null; // promesa con el libro.json de la página (o null si no trae)

function sinLibro() {
  var e = new Error('esta página no trae libro.json');
  e.sinLibro = true;
  return e;
}
function leerLibroPagina() {
  if (!libroPagina)
    libroPagina = fetch('libro.json').then(function (r) {
      if (r.status === 404) throw sinLibro();
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    });
  return libroPagina;
}
function claveAbierta(tipo, id) {
  return tipo === 'pagina' ? '' : tipo + ':' + id;
}
// Si localStorage está bloqueado, la elección se guarda para la pestaña (sessionStorage); si tampoco, no se puede.
function leerEleccion() {
  var v = lsGet(ABIERTO_KEY);
  if (v === null)
    try {
      v = sessionStorage.getItem(ABIERTO_KEY);
    } catch (e) {}
  return v || '';
}
function guardarEleccion(v) {
  if (lsSet(ABIERTO_KEY, v)) return true;
  try {
    sessionStorage.setItem(ABIERTO_KEY, v);
    return sessionStorage.getItem(ABIERTO_KEY) === v;
  } catch (e) {
    return false;
  }
}
// Clave local (anotaciones, leídas, visto…) de cada libro. La del libro de la página no cambia; la de uno importado
// lleva su lugar, y como un id nunca tiene «:», no puede coincidir con la de otro libro ni con las de la página.
function claveLocalDe(tipo, id) {
  return tipo === 'pagina' ? 'lector-anotaciones:' + (id || 'libro') : 'lector-anotaciones:' + tipo + ':' + id;
}
// El libro que esta carga va a mostrar: el elegido la última vez, o el de la página. Un libro importado se sanea y se
// valida antes de mostrarse; si ya no existe, se olvida la elección; si falló otra cosa (la base no respondió, o la
// página se abrió fuera de claude.ai), se conserva para la próxima carga.
function obtenerLibro() {
  var m = /^(base|local):([A-Za-z0-9_-]+)$/.exec(leerEleccion());
  var dePagina = function (aviso) {
    return leerLibroPagina().then(function (L) {
      return { libro: L, fuente: { tipo: 'pagina', id: null }, aviso: aviso };
    });
  };
  if (!m) return dePagina();
  var leer =
    m[1] === 'base'
      ? usoDb.then(function (d) {
          if (!d) throw new Error('sin base compartida en esta vista');
          return compartida.leer(d, m[2]);
        })
      : enNavegador.leer(m[2]);
  return leer
    .then(function (L) {
      if (!L) {
        var e = new Error('ya no está en la biblioteca');
        e.noEsta = true;
        throw e;
      }
      L.id = m[2];
      L.claves_anteriores = []; // las claves viejas de localStorage son del libro de la página
      N.sanearLibro(L);
      var problemas = N.validarLibro(L);
      if (problemas.length) {
        var e2 = new Error('el libro guardado no es válido: ' + problemas[0]);
        e2.noEsta = true;
        throw e2;
      }
      return { libro: L, fuente: { tipo: m[1], id: m[2] } };
    })
    .catch(function (e) {
      if (e && e.noEsta) guardarEleccion('');
      return dePagina(
        'No se pudo abrir el libro elegido (' +
          ((e && e.message) || e) +
          '); se abrió el de la página' +
          (e && e.noEsta ? '.' : ', y se volverá a intentar al recargar.')
      );
    });
}
// Colecciones del libro abierto en la base.
function rutaBase(nombre) {
  return FUENTE.tipo === 'base' ? 'libros/' + FUENTE.id + '/' + nombre : nombre;
}

// --- almacenamiento en este navegador (IndexedDB)
function almacen(modo, fn) {
  return new Promise(function (res, rej) {
    if (!window.indexedDB) {
      rej(new Error('este navegador no guarda libros (sin IndexedDB)'));
      return;
    }
    var pet;
    try {
      pet = indexedDB.open('lector-anotaciones', 1);
    } catch (e) {
      rej(e);
      return;
    }
    pet.onupgradeneeded = function () {
      pet.result.createObjectStore('libros', { keyPath: 'id' });
    };
    pet.onerror = function () {
      rej(pet.error || new Error('el navegador no permite guardar libros'));
    };
    pet.onsuccess = function () {
      var bd = pet.result,
        tx,
        r;
      try {
        tx = bd.transaction('libros', modo);
        r = fn(tx.objectStore('libros'));
      } catch (e) {
        bd.close();
        rej(e);
        return;
      }
      tx.oncomplete = function () {
        bd.close();
        res(r ? r.result : undefined);
      };
      tx.onerror = tx.onabort = function () {
        bd.close();
        rej(tx.error || new Error('no se pudo guardar en este navegador'));
      };
    };
  });
}
var enNavegador = {
  listar: function () {
    return almacen('readonly', function (st) {
      return st.getAll();
    }).then(function (xs) {
      return (xs || []).map(function (x) {
        return x.meta;
      });
    });
  },
  leer: function (id) {
    return almacen('readonly', function (st) {
      return st.get(id);
    }).then(function (x) {
      return x ? x.libro : null;
    });
  },
  guardar: function (meta, libro) {
    return almacen('readwrite', function (st) {
      return st.put({ id: meta.id, meta: meta, libro: libro });
    });
  },
  borrar: function (id) {
    return almacen('readwrite', function (st) {
      return st.delete(id);
    });
  },
};

// --- biblioteca compartida (la base de la página)
function trocear(texto) {
  var out = [],
    i = 0;
  while (i < texto.length) {
    var trozo = texto.slice(i, i + 60000);
    while (trozo.length > 1 && bytesJSON({ n: 99999, datos: trozo }) > PARTE_MAX)
      trozo = trozo.slice(0, Math.floor(trozo.length * 0.7));
    var c = trozo.charCodeAt(trozo.length - 1);
    if (trozo.length > 1 && c >= 0xd800 && c <= 0xdbff) trozo = trozo.slice(0, -1); // no partir un par sustituto
    out.push(trozo);
    i += trozo.length;
  }
  return out;
}
// Un rechazo pasajero se reintenta una vez, como en las anotaciones.
function conReintento(fn) {
  return fn().catch(function (e) {
    if (!N.esTransitorio(e && e.code)) throw e;
    return new Promise(function (r) {
      setTimeout(r, 200 + Math.random() * 400);
    }).then(fn);
  });
}
function partesDe(m) {
  var n = m && m.partes;
  return typeof n === 'number' && n >= 1 && n <= PARTES_MAX && n === Math.floor(n) ? n : 0;
}
function rutaParte(m, i) {
  return m.version ? m.version + '-' + i : String(i);
}
// Cada versión de un libro compartido escribe sus partes con su propio prefijo (`<versión>-<n>`) y sólo al final la
// ficha que las nombra (versión, número de partes, largo y huella del texto). Así, una subida que falla a mitad (o que
// alguien lee mientras tanto) nunca mezcla dos versiones: la ficha sigue apuntando a la anterior, intacta, y al leer
// se comprueba que lo armado coincide con la ficha. Las partes de la versión anterior se borran después.
var compartida = {
  listar: function (d) {
    return d
      .collection('libros')
      .get()
      .then(function (s) {
        return s.docs
          .map(function (x) {
            return x.data();
          })
          .filter(function (m) {
            return m && typeof m.id === 'string' && /^[A-Za-z0-9_-]+$/.test(m.id) && partesDe(m);
          });
      });
  },
  ficha: function (d, id) {
    return d
      .collection('libros')
      .doc(id)
      .get()
      .then(function (s) {
        return s.exists ? s.data() : null;
      });
  },
  leer: function (d, id) {
    return compartida.ficha(d, id).then(function (m) {
      if (!m) return null;
      var n = partesDe(m),
        ps = [];
      if (!n) throw new Error('la ficha del libro en la base está dañada');
      for (var i = 1; i <= n; i++)
        ps.push(
          d
            .collection('libros/' + id + '/partes')
            .doc(rutaParte(m, i))
            .get()
        );
      return Promise.all(ps).then(function (xs) {
        if (
          xs.some(function (x) {
            return !x.exists;
          })
        )
          throw new Error('faltan partes del libro en la base (¿se está reemplazando? vuelve a abrirlo en un momento)');
        var texto = xs
          .map(function (x) {
            return String(x.data().datos || '');
          })
          .join('');
        if ((m.largo && texto.length !== m.largo) || (m.huella && N.huella(texto) !== m.huella))
          throw new Error('las partes del libro no coinciden con su ficha');
        return JSON.parse(texto);
      });
    });
  },
  guardar: function (d, meta, libro, avance) {
    var texto = JSON.stringify(libro),
      partes = trocear(texto),
      col = d.collection('libros/' + meta.id + '/partes'),
      previa = null,
      escritas = [];
    var version = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    return compartida
      .ficha(d, meta.id)
      .then(function (m) {
        previa = m;
      })
      .then(function () {
        return partes.reduce(function (p, datos, i) {
          return p.then(function () {
            avance(i + 1, partes.length);
            var ruta = version + '-' + (i + 1);
            return conReintento(function () {
              return enCurso(col.doc(ruta).set({ n: i + 1, datos: datos }));
            }).then(function () {
              escritas.push(ruta);
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        meta.version = version;
        meta.partes = partes.length;
        meta.largo = texto.length;
        meta.huella = N.huella(texto);
        return conReintento(function () {
          return enCurso(d.collection('libros').doc(meta.id).set(meta));
        });
      })
      .then(
        function () {
          var n = partesDe(previa),
            b = [];
          for (var i = 1; i <= n; i++)
            b.push(
              col
                .doc(rutaParte(previa, i))
                .delete()
                .catch(function () {})
            );
          return Promise.all(b);
        },
        function (e) {
          // la subida no se completó: la ficha sigue en la versión anterior; se retiran las partes nuevas sueltas
          escritas.forEach(function (r) {
            col
              .doc(r)
              .delete()
              .catch(function () {});
          });
          throw e;
        }
      );
  },
  // Se borran el libro y sus partes; sus anotaciones quedan en la base y vuelven si se importa de nuevo.
  borrar: function (d, id) {
    return compartida.ficha(d, id).then(function (m) {
      return d
        .collection('libros')
        .doc(id)
        .delete()
        .then(function () {
          var n = partesDe(m),
            b = [];
          for (var i = 1; i <= n; i++)
            b.push(
              d
                .collection('libros/' + id + '/partes')
                .doc(rutaParte(m, i))
                .delete()
                .catch(function () {})
            );
          return Promise.all(b);
        });
    });
  },
};

// --- abrir otro libro: recordar la elección y recargar cuando no quede nada por escribir
// Lo que todavía no confirmó la base (una escritura lenta, o a la espera de su reintento) pasa a la copia del navegador
// antes de recargar; al volver a este libro, la página la recupera y la vuelve a subir.
function abrirLibro(tipo, id) {
  if (!guardarEleccion(claveAbierta(tipo, id))) {
    estadoBib(
      'Este navegador no deja guardar la elección (almacenamiento bloqueado): no se puede cambiar de libro.',
      true
    );
    return false;
  }
  estadoBib('Abriendo…');
  var activo = /** @type {HTMLElement} */ (document.activeElement);
  if (activo && activo.blur) activo.blur(); // guarda la nota en edición
  var inicio = Date.now();
  (function esperar() {
    var vuelo = Object.keys(SINC.enVuelo).filter(function (k) {
      return !!anots[k];
    });
    if ((ESCRIBIENDO > 0 || vuelo.length) && Date.now() - inicio < 4000) {
      setTimeout(esperar, 100);
      return;
    }
    if (vuelo.length) guardarLocal(vuelo);
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch (e) {}
    location.reload();
  })();
  return true;
}

// --- la ventana de la biblioteca
var LISTA = []; // [{ tipo, id, titulo, autor, detalle }]
var PREVIA = null; // { libro, avisos, origen } del archivo leído, a la espera de confirmar
var BASE_BIB = null,
  PUEDE_COMPARTIR = false,
  LISTA_FALLO = false;
function estadoBib(t, aviso) {
  var e = $('#bib-estado');
  e.textContent = t || '';
  e.className = 'bib-estado' + (aviso ? ' aviso' : '');
}
function abrirBiblioteca() {
  abrirDialogo($('#biblioteca'));
  renderBiblioteca();
}
function cargarLista() {
  var pagina = leerLibroPagina().then(
    function (L) {
      return [
        {
          tipo: 'pagina',
          id: L.id || 'libro',
          titulo: L.titulo || 'Libro',
          autor: L.autor || '',
          detalle: 'libro de esta página',
        },
      ];
    },
    function () {
      return [];
    }
  );
  var base = Promise.all([usoDb, usoUser]).then(function (r) {
    BASE_BIB = r[0];
    if (!BASE_BIB) {
      PUEDE_COMPARTIR = false;
      return [];
    }
    var permiso =
      r[1] && r[1].can
        ? r[1].can('data.write').catch(function () {
            return null;
          })
        : Promise.resolve(null);
    // si la lista compartida no se puede leer, tampoco se ofrece guardar en ella: no se sabría si pisa el libro de otro
    LISTA_FALLO = false;
    return permiso
      .then(function (p) {
        PUEDE_COMPARTIR = p !== false && !SOLO_LECTURA;
        return compartida.listar(BASE_BIB);
      })
      .then(
        function (ms) {
          return ms.map(function (m) {
            return {
              tipo: 'base',
              id: m.id,
              titulo: String(m.titulo || m.id),
              autor: String(m.autor || ''),
              detalle: 'compartido' + (m.importado ? ' · importado el ' + String(m.importado).slice(0, 10) : ''),
            };
          });
        },
        function () {
          LISTA_FALLO = true;
          PUEDE_COMPARTIR = false;
          return [];
        }
      );
  });
  var nav = enNavegador.listar().then(
    function (ms) {
      return ms.map(function (m) {
        return {
          tipo: 'local',
          id: m.id,
          titulo: String(m.titulo || m.id),
          autor: m.autor || '',
          detalle:
            'sólo en este navegador' + (m.importado ? ' · importado el ' + String(m.importado).slice(0, 10) : ''),
        };
      });
    },
    function () {
      return [];
    }
  );
  return Promise.all([pagina, base, nav]).then(function (r) {
    LISTA = r[0].concat(r[1], r[2]);
    return LISTA;
  });
}
function renderBiblioteca() {
  var ul = $('#bib-lista');
  return cargarLista().then(function () {
    ul.innerHTML = '';
    $('#bib-intro').textContent = LISTA_FALLO
      ? 'No se pudo leer la biblioteca compartida; por ahora, lo que importes quedará sólo en este navegador. Vuelve a abrir la biblioteca para reintentar.'
      : BASE_BIB
        ? PUEDE_COMPARTIR
          ? 'Los libros compartidos los ve todo el que abre esta página; los de este navegador, sólo tú.'
          : 'Puedes leer los libros compartidos; los que importes quedarán sólo en este navegador.'
        : 'Sin base compartida: los libros que importes quedan sólo en este navegador.';
    if (!LISTA.length)
      ul.appendChild(el('li', { 'class': 'vacio', text: 'Todavía no hay libros. Importa uno abajo.' }));
    LISTA.forEach(function (x) {
      var abierto = x.tipo === FUENTE.tipo && (x.tipo === 'pagina' || x.id === FUENTE.id) && !!LIBRO;
      var li = el('li', { 'class': 'bib-libro' + (abierto ? ' abierto' : '') }, [
        el('div', { 'class': 'datos' }, [
          el('div', { 'class': 't', text: x.titulo }),
          el('div', { 'class': 'd', text: [x.autor, x.detalle, abierto ? 'abierto' : ''].filter(Boolean).join(' · ') }),
        ]),
      ]);
      var acc = el('div', { 'class': 'acc' });
      if (!abierto)
        acc.appendChild(
          el('button', {
            'class': 'btn peq primario',
            type: 'button',
            text: 'Abrir',
            onclick: function () {
              abrirLibro(x.tipo, x.id);
            },
          })
        );
      acc.appendChild(
        el('button', {
          'class': 'btn peq',
          type: 'button',
          text: 'Markdown',
          title: 'Descargar el libro como Markdown (para la línea de órdenes)',
          onclick: function () {
            exportar(x, 'md');
          },
        })
      );
      acc.appendChild(
        el('button', {
          'class': 'btn peq',
          type: 'button',
          text: 'libro.json',
          title: 'Descargar el libro.json',
          onclick: function () {
            exportar(x, 'json');
          },
        })
      );
      if (x.tipo !== 'pagina' && (x.tipo === 'local' || PUEDE_COMPARTIR)) {
        var del = el('button', { 'class': 'btn peq', type: 'button', text: 'Borrar' });
        del.addEventListener('click', function () {
          var si = el('button', {
            'class': 'btn peq',
            type: 'button',
            text: 'Sí, borrar',
            onclick: function () {
              borrarLibro(x);
            },
          });
          var no = el('button', {
            'class': 'btn peq',
            type: 'button',
            text: 'No',
            onclick: function () {
              acc.replaceChild(del, c);
              del.focus();
            },
          });
          var c = el('span', { 'class': 'confirmar' }, [
            el('span', {
              text:
                x.tipo === 'base'
                  ? '¿Borrar? (sus anotaciones quedan en la base)'
                  : '¿Borrar? (y sus anotaciones de este navegador)',
            }),
            si,
            no,
          ]);
          acc.replaceChild(c, del);
          si.focus();
        });
        acc.appendChild(del);
      }
      li.appendChild(acc);
      ul.appendChild(li);
    });
  });
}
function libroDe(x) {
  if (x.tipo === FUENTE.tipo && (x.tipo === 'pagina' || x.id === FUENTE.id) && LIBRO) return Promise.resolve(LIBRO);
  if (x.tipo === 'pagina') return leerLibroPagina();
  if (x.tipo === 'base') return compartida.leer(BASE_BIB, x.id);
  return enNavegador.leer(x.id);
}
function descargar(nombre, texto) {
  var uso = window.claude && window.claude.use ? window.claude.use('downloads') : Promise.resolve(null);
  return uso.then(function (dl) {
    if (dl)
      return dl.save({ filename: nombre, data: texto }).then(
        function () {
          estadoBib('Listo: ' + nombre);
        },
        function (e) {
          if (!e || e.code !== 'declined') estadoBib('No se pudo descargar (' + ((e && e.code) || 'error') + ')', true);
        }
      );
    var url = URL.createObjectURL(new Blob([texto], { type: 'application/octet-stream' })),
      a = el('a', { href: url, download: nombre });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 5000);
    estadoBib('Descargado: ' + nombre);
  });
}
function exportar(x, formato) {
  estadoBib('Preparando…');
  libroDe(x)
    .then(function (L) {
      if (!L) throw new Error('el libro ya no está');
      return descargar(
        N.slug(x.titulo || x.id, 60) + (formato === 'md' ? '.md' : '.json'),
        formato === 'md' ? N.libroAMarkdown(L) : JSON.stringify(L)
      );
    })
    .catch(function (e) {
      estadoBib('No se pudo exportar: ' + ((e && e.message) || e), true);
    });
}
function borrarLibro(x) {
  estadoBib('Borrando…');
  var hecho =
    x.tipo === 'base'
      ? compartida.borrar(BASE_BIB, x.id)
      : enNavegador.borrar(x.id).then(function () {
          // las anotaciones de un libro sólo de este navegador viven en su clave local
          ['', ':campos', ':visto', ':leidas', ':capas', ':ultima', ':foco', ':respaldo'].forEach(function (s) {
            try {
              localStorage.removeItem(claveLocalDe('local', x.id) + s);
            } catch (e) {}
          });
        });
  hecho.then(
    function () {
      estadoBib('Libro borrado.');
      if (x.tipo === FUENTE.tipo && x.id === FUENTE.id) abrirLibro('pagina', null);
      else renderBiblioteca();
    },
    function (e) {
      estadoBib('No se pudo borrar (' + ((e && (e.code || e.message)) || 'error') + ')', true);
    }
  );
}

// --- importar
function leerArchivos(files) {
  return Promise.all(
    Array.prototype.map.call(files, function (f) {
      return f.arrayBuffer().then(function (b) {
        return { nombre: f.name, bytes: new Uint8Array(b) };
      });
    })
  );
}
function prepararImportacion(files) {
  if (!files || !files.length) return;
  PREVIA = null;
  $('#bib-previa').hidden = true;
  estadoBib('Leyendo ' + (files.length === 1 ? files[0].name : files.length + ' archivos') + '…');
  leerArchivos(files)
    .then(function (archivos) {
      return N.importarLibro(archivos, {
        parsear: function (texto, tipo) {
          return new DOMParser().parseFromString(texto, tipo);
        },
      });
    })
    .then(
      function (r) {
        PREVIA = r;
        estadoBib('');
        mostrarPrevia();
      },
      function (e) {
        estadoBib('No se pudo leer: ' + ((e && e.message) || e), true);
      }
    );
}
function idLibre(base, usados) {
  var id = base,
    n = 2;
  while (usados[id]) {
    id = base + '-' + n;
    n++;
  }
  return id;
}
// Qué id tendrá el libro y si choca con otro: el de la página no se puede reemplazar; uno importado, sí.
function destinoImportacion() {
  var titulo = $('#bib-titulo').value.trim() || PREVIA.libro.titulo,
    dondeEl = $('input[name="bib-donde"]:checked'),
    donde = dondeEl ? dondeEl.value : 'local';
  // Los ids son únicos en toda la biblioteca (nombran también la copia local de las anotaciones): sólo se reemplaza un
  // libro del mismo lugar; si el título coincide con uno de otro lugar o con el de la página, el nuevo lleva sufijo.
  var base = N.slug(titulo),
    mismos = {},
    todos = {},
    dePagina = LISTA.filter(function (x) {
      return x.tipo === 'pagina';
    })[0];
  LISTA.forEach(function (x) {
    todos[x.id] = 1;
    if (x.tipo === donde) mismos[x.id] = 1;
  });
  var choca = !!mismos[base] && !(dePagina && dePagina.id === base);
  var reemplazar = choca && (($('input[name="bib-choque"]:checked') || {}).value || 'reemplazar') === 'reemplazar';
  return { titulo: titulo, donde: donde, choca: choca, id: reemplazar ? base : idLibre(base, todos) };
}
function actualizarPrevia() {
  if (!PREVIA) return;
  var d = destinoImportacion();
  $('#bib-choque').hidden = !d.choca;
  $('#bib-importar').textContent = d.choca && d.id === N.slug(d.titulo) ? 'Reemplazar y abrir' : 'Importar y abrir';
}
function mostrarPrevia() {
  var L = PREVIA.libro,
    nb = L.secciones.reduce(function (n, s) {
      return n + s.bloques.length;
    }, 0);
  $('#bib-resumen').textContent =
    '«' +
    L.titulo +
    '»: ' +
    L.secciones.length +
    (L.secciones.length === 1 ? ' sección, ' : ' secciones, ') +
    nb +
    ' bloques (' +
    PREVIA.origen +
    ').';
  var av = $('#bib-avisos');
  av.innerHTML = '';
  (PREVIA.avisos || []).forEach(function (a) {
    av.appendChild(el('li', { text: a }));
  });
  $('#bib-titulo').value = L.titulo || '';
  $('#bib-autor').value = L.autor || '';
  var base = $('input[name="bib-donde"][value="base"]');
  base.disabled = !PUEDE_COMPARTIR;
  base.closest('label').classList.toggle('no', !PUEDE_COMPARTIR);
  (PUEDE_COMPARTIR ? base : $('input[name="bib-donde"][value="local"]')).checked = true;
  $('input[name="bib-choque"][value="reemplazar"]').checked = true;
  $('#bib-previa').hidden = false;
  actualizarPrevia();
  $('#bib-titulo').focus();
}
function confirmarImportacion(ev) {
  ev.preventDefault();
  if (!PREVIA) return;
  var d = destinoImportacion(),
    L = PREVIA.libro;
  L.id = d.id;
  L.titulo = d.titulo;
  L.autor = $('#bib-autor').value.trim();
  L.claves_anteriores = [];
  var nb = L.secciones.reduce(function (n, s) {
    return n + s.bloques.length;
  }, 0);
  var meta = {
    id: d.id,
    titulo: L.titulo,
    autor: L.autor,
    subtitulo: L.subtitulo || '',
    generado: L.generado || null,
    importado: ahora(),
    origen: PREVIA.origen,
    archivos: L.fuentes || [],
    secciones: L.secciones.length,
    bloques: nb,
    por: ME || null,
  };
  $('#bib-importar').disabled = true;
  estadoBib('Guardando…');
  // Justo antes de guardar en la biblioteca compartida se vuelve a mirar si alguien guardó entre tanto un libro con ese
  // id: sólo se reemplaza lo que el lector eligió reemplazar.
  var libre =
    d.donde === 'base' && !(d.choca && d.id === N.slug(d.titulo))
      ? compartida.ficha(BASE_BIB, d.id)
      : Promise.resolve(null);
  libre
    .then(function (otro) {
      if (otro) {
        LISTA.push({
          tipo: 'base',
          id: d.id,
          titulo: String(otro.titulo || d.id),
          autor: String(otro.autor || ''),
          detalle: 'compartido',
        });
        actualizarPrevia();
        var e = new Error(
          'mientras tanto alguien guardó un libro con ese título; elige reemplazarlo o guardarlo como otro'
        );
        e.choque = true;
        throw e;
      }
      return d.donde === 'base'
        ? compartida.guardar(BASE_BIB, meta, L, function (i, n) {
            if (n > 1) estadoBib('Guardando en la biblioteca compartida… ' + i + ' de ' + n);
          })
        : enNavegador.guardar(meta, L);
    })
    .then(
      function () {
        PREVIA = null;
        if (!abrirLibro(d.donde, d.id)) $('#bib-importar').disabled = false;
      },
      function (e) {
        $('#bib-importar').disabled = false;
        if (e && e.choque) {
          estadoBib(e.message.charAt(0).toUpperCase() + e.message.slice(1) + '.', true);
          return;
        }
        estadoBib(
          'No se pudo guardar (' +
            ((e && (e.code || e.message)) || 'error') +
            ')' +
            (d.donde === 'base' ? '; prueba a guardarlo sólo en este navegador.' : '.'),
          true
        );
      }
    );
}
$('#b-biblioteca').addEventListener('click', abrirBiblioteca);
$('#aviso-libro .cerrar').addEventListener('click', function () {
  $('#aviso-libro').hidden = true;
  $('#lectura').focus({ preventScroll: true });
});
$('#biblioteca').addEventListener('click', function (ev) {
  if (ev.target === this || ev.target.closest('.dialogo-cab .cerrar')) cerrarDialogo(this);
});
$('#bib-elegir').addEventListener('click', function () {
  $('#bib-archivo').click();
});
$('#bib-archivo').addEventListener(
  'change',
  /** @this {HTMLInputElement} */ function () {
    prepararImportacion(this.files);
    this.value = '';
  }
);
$('#bib-previa').addEventListener('submit', confirmarImportacion);
$('#bib-cancelar').addEventListener('click', function () {
  PREVIA = null;
  $('#bib-previa').hidden = true;
  estadoBib('');
  $('#bib-elegir').focus();
});
$('#bib-titulo').addEventListener('input', actualizarPrevia);
$$('input[name="bib-donde"], input[name="bib-choque"]').forEach(function (r) {
  r.addEventListener('change', actualizarPrevia);
});
(function () {
  var zona = $('#bib-zona');
  ['dragenter', 'dragover'].forEach(function (t) {
    zona.addEventListener(t, function (ev) {
      ev.preventDefault();
      zona.classList.add('arrastrando');
    });
  });
  ['dragleave', 'drop'].forEach(function (t) {
    zona.addEventListener(t, function (ev) {
      ev.preventDefault();
      zona.classList.remove('arrastrando');
    });
  });
  zona.addEventListener('drop', function (ev) {
    prepararImportacion(ev.dataTransfer && ev.dataTransfer.files);
  });
})();
// Sin libro que mostrar (la página no trae libro.json): se invita a importar uno.
function mostrarSinLibro(motivo) {
  var lect = $('#lectura');
  lect.innerHTML = '';
  var v = el('div', { 'class': 'vacio' }, [
    el('div', {
      text:
        motivo ||
        'Esta página todavía no tiene un libro. Importa uno (Markdown, texto, HTML, EPUB o Word) desde la biblioteca.',
    }),
  ]);
  v.appendChild(
    el('button', { 'class': 'btn primario', type: 'button', text: 'Abrir la biblioteca', onclick: abrirBiblioteca })
  );
  lect.appendChild(v);
  $('#sub').textContent = 'sin libro';
  estado('Sin libro abierto', true);
  abrirBiblioteca();
}
