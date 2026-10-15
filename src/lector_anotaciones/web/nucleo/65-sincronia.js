// Núcleo · sincronía de las anotaciones entre la memoria, la base compartida y la copia del navegador. Sin DOM ni
// entrada y salida: aquí se decide qué escribir, qué hacer ante una confirmación o un rechazo y cómo fundir lo que
// llega (una foto de la base, la copia local); la página hace las escrituras, los temporizadores y lo que se ve.
(function (raiz, crear) {
  var N = (raiz.LANucleo = raiz.LANucleo || {}),
    m = crear(N);
  Object.keys(m).forEach(function (k) {
    N[k] = m[k];
  });
})(typeof self !== 'undefined' ? self : globalThis, function (N) {
  'use strict';

  // Códigos de rechazo de la base (db.d.ts). Los transitorios se reintentan una vez; uno desconocido se trata como
  // `unavailable`, como manda el contrato. Los de permiso son definitivos para la visita: pasan a sólo lectura.
  var TRANSITORIOS = { unavailable: 1, resource_exhausted: 1 };
  var CONOCIDOS = {
    invalid_argument: 1,
    resource_exhausted: 1,
    quota_exceeded: 1,
    unavailable: 1,
    revoked: 1,
    not_granted: 1,
    capability_disabled: 1,
    capability_removed: 1,
    transform_error: 1,
  };
  function esTransitorio(codigo) {
    return !codigo || !!TRANSITORIOS[codigo] || !CONOCIDOS[codigo];
  }
  // `invalid_argument` sobre un documento pequeño es un permiso que no se dice (la página de sólo lectura no puede
  // escribir); sobre uno grande, el tamaño. En un respaldo nunca es de permiso.
  function esDePermiso(codigo, tamano, verbo) {
    return (
      codigo === 'not_granted' ||
      codigo === 'revoked' ||
      (codigo === 'invalid_argument' && verbo !== 'respaldo' && tamano < 200000)
    );
  }
  function copia(a) {
    return JSON.parse(JSON.stringify(a));
  }

  // El estado de la sincronía, explícito y en un solo sitio:
  //   anots       id → anotación (lo que la página muestra)
  //   campos      id → { campo: true }: lo que el lector cambió y la base todavía no confirmó (viaja con la copia local)
  //   sinGuardar  id → código del último rechazo de una anotación que la base no tiene; se conserva en el navegador
  //   enVuelo     id → 1 mientras una escritura espera respuesta (reintento incluido)
  //   enBase      id → 1 si la base tiene el documento (llegó en una foto o se confirmó su escritura)
  //   pendientes  ids que esperan su primera subida (anotadas mientras conectaba, recuperadas del navegador)
  function crearSincronia() {
    var S = { anots: {}, campos: {}, sinGuardar: {}, enVuelo: {}, enBase: {}, pendientes: [] };

    function pendiente(id) {
      if (S.pendientes.indexOf(id) < 0) S.pendientes.push(id);
    }
    // Quita las marcas de los campos que la base ya tiene con el valor de la memoria (`enBase`: lo que se escribió, o
    // la versión de la base a la que se volvió); sin `enBase`, todas (la anotación se borró). Lo que se siguió editando
    // después conserva su marca.
    S.limpiarCampos = function (id, enBase) {
      var c = S.campos[id];
      if (!c) return;
      Object.keys(c).forEach(function (k) {
        if (!enBase || !S.anots[id] || S.anots[id][k] === enBase[k]) delete c[k];
      });
      if (!Object.keys(c).length) delete S.campos[id];
    };

    // El lector cambió una anotación (o creó una). Devuelve la versión previa —lo que la base tiene, para volver a ello
    // si rechaza— salvo que la base no la tenga (nueva, o rechazada y conservada): entonces no hay a qué volver.
    S.cambiar = function (a, ahora) {
      var antes = S.anots[a.id],
        nueva = !antes || !!S.sinGuardar[a.id];
      var previa = nueva ? null : copia(antes);
      if (antes) N.marcarCampos(S.campos[a.id] || (S.campos[a.id] = {}), antes, a);
      a.editado = ahora;
      S.anots[a.id] = a;
      return { previa: previa, nueva: nueva };
    };

    // Qué escribir en la base para esa id. Si la base ya tiene el documento, sólo los campos que el lector cambió (y
    // `editado`) con `update`: lo que quien edita las fuentes escribió entre tanto no se pisa. Si no, entera con `set`.
    S.escritura = function (id) {
      var a = S.anots[id];
      if (!a) return null;
      if (!S.enBase[id] || S.sinGuardar[id]) return { modo: 'set', datos: a, anotacion: a };
      var p = { editado: a.editado };
      Object.keys(S.campos[id] || {}).forEach(function (k) {
        p[k] = a[k] === undefined ? null : a[k];
      });
      return { modo: 'update', datos: p, anotacion: a };
    };

    // La base confirmó la escritura de `escrita`. `soltarCopia`: la copia local de una anotación que estaba «sin
    // guardar» ya no hace falta, salvo que se haya seguido editando después de esta escritura.
    S.alConfirmar = function (id, escrita) {
      delete S.enVuelo[id];
      S.enBase[id] = 1;
      S.limpiarCampos(id, escrita);
      var estaba = !!S.sinGuardar[id];
      if (estaba) delete S.sinGuardar[id];
      return { estabaSinGuardar: estaba, soltarCopia: estaba && S.anots[id] === escrita };
    };

    // La base rechazó una escritura (`verbo`: 'guardar' o 'borrar'). La memoria vuelve a lo que la base tiene, para que
    // no queden anotaciones fantasma; una anotación que la base no tiene nunca se retira: se conserva «sin guardar» y
    // en la cola de subida, también ante un rechazo de permiso.
    S.alRechazar = function (id, codigo, previa, verbo) {
      if (verbo !== 'borrar') delete S.enVuelo[id];
      var tamano = JSON.stringify(previa || S.anots[id] || {}).length;
      var r = { permiso: esDePermiso(codigo, tamano, verbo), conservada: false, restaurada: null };
      if (verbo === 'borrar') {
        if (previa) S.anots[id] = r.restaurada = previa;
      } else if (previa) {
        S.anots[id] = r.restaurada = previa;
        S.limpiarCampos(id, previa);
      } else {
        S.sinGuardar[id] = codigo;
        pendiente(id);
        r.conservada = true;
      }
      return r;
    };

    // Borrar: sale de la memoria. Devuelve lo que hace falta para volver atrás (la anotación, su marca de «sin guardar»
    // y la lista de campos cambiados).
    S.quitar = function (id) {
      var a = S.anots[id];
      if (!a) return null;
      var r = { anotacion: a, marca: S.sinGuardar[id], campos: S.campos[id] ? Object.assign({}, S.campos[id]) : null };
      delete S.anots[id];
      delete S.sinGuardar[id];
      return r;
    };
    S.alBorrar = function (id) {
      delete S.enBase[id];
      var i = S.pendientes.indexOf(id);
      if (i >= 0) S.pendientes.splice(i, 1);
      S.limpiarCampos(id);
    };

    // Una foto de la base: `cambios` = [{ tipo: 'added' | 'modified' | 'removed', id, datos }]. Si aquí hay un borrador
    // sin guardar de esa anotación, lo que llega se funde debajo sin pisarlo. Devuelve si cambió algo de lo visible.
    S.alFoto = function (cambios) {
      var cambio = false;
      cambios.forEach(function (ch) {
        if (ch.tipo === 'removed') {
          delete S.enBase[ch.id];
          if (S.anots[ch.id]) {
            delete S.anots[ch.id];
            cambio = true;
          }
        } else if (ch.datos) {
          S.enBase[ch.id] = 1;
          var nuevo = Object.assign({}, ch.datos, { id: ch.id });
          if (S.sinGuardar[ch.id] && S.anots[ch.id]) nuevo = N.fundirBorrador(nuevo, S.anots[ch.id], S.campos[ch.id]);
          if (!N.igual(S.anots[ch.id], nuevo)) {
            S.anots[ch.id] = nuevo;
            cambio = true;
          }
        }
      });
      return cambio;
    };

    // La copia del navegador (`local`, con su lista de campos cambiados) entra en la memoria. Lo que ya está en memoria
    // manda, salvo un borrador local más reciente, que se funde sobre ello (y vuelve a subir). `filtro(id, anotación)`
    // puede dejar algo fuera (de otra cuenta): se queda en la copia sin cargarse. Devuelve las ids cargadas (`nuevas`)
    // y las que ya estaban (`existentes`).
    S.fusionarLocal = function (local, campos, filtro) {
      var nuevas = [],
        existentes = [];
      Object.keys(local).forEach(function (k) {
        var mem = S.anots[k],
          loc = local[k];
        var masNueva = mem && loc && loc.editado && mem.editado && loc.editado > mem.editado;
        if (mem && !masNueva) existentes.push(k);
        else if (!filtro || filtro(k, loc)) {
          if (campos && campos[k]) S.campos[k] = campos[k];
          S.anots[k] = masNueva ? N.fundirBorrador(mem, loc, campos && campos[k]) : loc;
          nuevas.push(k);
        }
      });
      return { nuevas: nuevas, existentes: existentes };
    };

    // Al conectar: las recuperadas del navegador van a la cola; las que la base ya tenía (y no esperan subir) sobran en
    // la copia local. Devuelve esas sobrantes.
    S.alRecuperar = function (r) {
      r.nuevas.forEach(pendiente);
      var sobran = r.existentes.filter(function (id) {
        return S.pendientes.indexOf(id) < 0;
      });
      sobran.forEach(function (id) {
        S.limpiarCampos(id, S.anots[id]);
      });
      return sobran;
    };
    // Vacía la cola de subida: las ids que siguen en memoria, con su autor si no lo tenían.
    S.tomarPendientes = function (yo) {
      return S.pendientes.splice(0).filter(function (id) {
        var a = S.anots[id];
        if (!a) return false;
        if (!a.autor && yo) a.autor = yo;
        return true;
      });
    };
    // Resultado de la subida de la cola: `resultados[i]` es true o el código del rechazo de `ids[i]`; `escritas[id]`, lo
    // que se subió. Devuelve las que subieron sin cambios posteriores (su copia local sobra) y las que fallaron.
    S.alSubir = function (ids, resultados, escritas) {
      var soltar = [],
        fallidas = [];
      ids.forEach(function (id, i) {
        if (resultados[i] === true) {
          S.enBase[id] = 1;
          S.limpiarCampos(id, escritas[id]);
          if (S.anots[id] === escritas[id]) soltar.push(id);
        } else {
          S.sinGuardar[id] = resultados[i];
          fallidas.push(id);
        }
      });
      return { soltar: soltar, fallidas: fallidas };
    };
    // En sólo lectura la cola no puede subir: lo que espera queda «sin guardar» en el navegador.
    S.marcarSinSubir = function () {
      var ids = S.pendientes.filter(function (id) {
        return !!S.anots[id];
      });
      ids.forEach(function (id) {
        S.sinGuardar[id] = 'sólo lectura';
      });
      return ids;
    };

    return S;
  }

  // Migración de claves locales: copia en `local` lo de versiones anteriores de la página (`viejas`: clave → objeto),
  // sin pisar lo que ya hay. Devuelve cuántas anotaciones se copiaron.
  function migrarClaves(local, viejas) {
    var n = 0;
    Object.keys(viejas).forEach(function (k) {
      var v = viejas[k] || {};
      Object.keys(v).forEach(function (id) {
        if (!local[id]) {
          local[id] = v[id];
          n++;
        }
      });
    });
    return n;
  }

  return {
    crearSincronia: crearSincronia,
    migrarClaves: migrarClaves,
    esTransitorio: esTransitorio,
    esDePermiso: esDePermiso,
  };
});
