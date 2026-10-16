"""El lado de quien edita las fuentes: qué espera respuesta y las escrituras que la dejan en la base.

`pendientes` separa lo que espera a quien edita (una anotación sin respuesta, una que el autor reabrió, una pregunta
que el autor ya contestó) de lo que espera al autor. `escrituras` convierte unas respuestas en las escrituras de la
acción «batch» de `ArtifactData`: un `update` por anotación, sólo con los campos de quien responde, con lo vigente
pasado al `hilo` y fijado a la versión que se leyó (`if_version`), para que nada escrito entre tanto se pise.
"""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from pathlib import Path

from .exportar import _linea, _orden_archivo, normalizar, reabierta
from .tipos import Anotacion, Json

CIERRES = ("atendida", "descartada", "pregunta")
MOTIVOS = {"nueva": "sin respuesta", "reabierta": "reabierta por el autor", "replica": "el autor contestó la pregunta"}
# Límites de la acción «batch»: 50 escrituras y 1 MiB por llamada (se deja margen para el envoltorio).
MAX_ESCRITURAS = 50
MAX_BYTES = 900_000
BORRAR = {"__delete__": True}


def cargar_coleccion(ruta: Path, de_la_base: bool = False) -> list[Anotacion]:
    """Las anotaciones de un JSON (cualquiera de las formas de `exportar.normalizar`) o de un directorio con un
    documento por archivo, como lo deja `ArtifactData` con `out_dir` (`<dir>/anotaciones/<id>.json`); ahí la id es el
    nombre del archivo, que es la del documento. Con `de_la_base`, lo copiado de la página («Copiar todo») no sirve:
    las escrituras se fijan a versiones de una lectura de la base, y su contenido tiene que ser el de esa lectura.
    Una id repetida es un error."""
    ruta = Path(ruta)
    if ruta.is_dir():
        docs: dict[str, Anotacion] = {}
        for f in sorted(ruta.rglob("*.json")):
            d = json.loads(f.read_text(encoding="utf-8-sig"))
            if not isinstance(d, dict):
                continue
            if f.stem in docs:
                raise ValueError(f"la id {f.stem} está en dos archivos del directorio ({f})")
            docs[f.stem] = dict(d, id=f.stem)
        if not docs:
            raise ValueError(f"{ruta} no tiene documentos .json")
        return list(docs.values())
    datos = json.loads(ruta.read_text(encoding="utf-8-sig"))
    anots = normalizar(datos)
    if de_la_base and (
        (isinstance(datos, dict) and ("formato" in datos or "anotaciones" in datos))
        or any("sin_guardar" in a for a in anots)
    ):
        raise ValueError(
            "eso es lo que copia la página, no una lectura de la base: responder necesita la colección y sus versiones "
            "de la misma lectura (el directorio de `ArtifactData` con out_dir y el texto que devolvió)"
        )
    _por_id(anots)
    return anots


def _por_id(anots: list[Anotacion]) -> dict[str, Anotacion]:
    por_id: dict[str, Anotacion] = {}
    for a in anots:
        if a["id"] in por_id:
            raise ValueError(f"la id {a['id']} está dos veces en la colección")
        por_id[a["id"]] = a
    return por_id


def motivo(a: Anotacion) -> str | None:
    """Por qué una anotación espera a quien edita (`nueva`, `reabierta`, `replica`), o None si no lo espera: resuelta,
    respondida y a la espera de que el autor la revise, o una pregunta que el autor no contestó."""
    if a.get("estado") == "resuelta":
        return None
    if a.get("cierre") == "pregunta":
        return "replica" if (a.get("replica") or "").strip() else None
    if reabierta(a):
        return "reabierta"
    if not (a.get("respuesta") or a.get("cierre")):
        return "nueva"
    return None


def pendientes(anots: list[Anotacion]) -> list[tuple[str, Anotacion]]:
    """(motivo, anotación) de lo que espera a quien edita, en el orden en que conviene aplicarlo: por archivo y
    línea; las notas sin origen (de sección, generales) al final."""
    lista = [(m, a) for a in anots if (m := motivo(a))]
    return sorted(lista, key=lambda x: (not x[1].get("src"), _orden_archivo(x[1]), x[1].get("creado") or ""))


def a_texto(lista: list[tuple[str, Anotacion]]) -> str:
    """Las pendientes como Markdown: la anotación (con su conversación) bajo su id y el motivo."""
    cuenta = {m: sum(1 for x, _ in lista if x == m) for m in MOTIVOS}
    partes = ", ".join(f"{n} {MOTIVOS[m]}" for m, n in cuenta.items() if n)
    out = [f"# Pendientes · {len(lista)}" + (f" ({partes})" if partes else ""), ""]
    for m, a in lista:
        out.append(f"- `{a['id']}` · {MOTIVOS[m]}")
        out += ["  " + linea for linea in _linea(a)]
    return "\n".join(out) + "\n"


# Una línea del texto de una lectura de `ArtifactData`: `- "id"  2772 bytes  version 20  "ruta"`.
_VERSION_TEXTO = re.compile(r'^\s*-\s+"([A-Za-z0-9_\-.~:@+]+)"\s.*?\bversion\s+(\d+)\b', re.M)


def leer_versiones(ruta: Path) -> dict[str, int]:
    """Las versiones de los documentos: un JSON `{id: versión}`, o el texto que devuelve una lectura de `ArtifactData`.
    Una id con dos versiones distintas es un error."""
    texto = Path(ruta).read_text(encoding="utf-8-sig")
    try:
        datos = json.loads(texto)
    except json.JSONDecodeError:
        versiones: dict[str, int] = {}
        for m in _VERSION_TEXTO.finditer(texto):
            v = int(m.group(2))
            if versiones.get(m.group(1), v) != v:
                raise ValueError(f"la id {m.group(1)} aparece con dos versiones") from None
            versiones[m.group(1)] = v
        return versiones
    if not isinstance(datos, dict) or not all(type(v) is int and v > 0 for v in datos.values()):
        raise ValueError("las versiones deben ser un objeto {id: versión}, con versiones enteras")
    return datos


def leer_respuestas(ruta: Path) -> list[Json]:
    """Las respuestas: una lista de `{id, respuesta, cierre, commit?}` o un objeto `{id: {respuesta, cierre, …}}`."""
    datos = json.loads(Path(ruta).read_text(encoding="utf-8-sig"))
    forma = "las respuestas deben ser una lista de {id, respuesta, cierre, commit?} o un objeto {id: {respuesta, …}}"
    if isinstance(datos, dict):
        if not all(isinstance(v, dict) for v in datos.values()):
            raise ValueError(forma)
        datos = [dict(v, id=v.get("id", k)) for k, v in datos.items()]
    if not isinstance(datos, list) or not all(isinstance(r, dict) and isinstance(r.get("id"), str) for r in datos):
        raise ValueError(forma)
    return datos


def iso(t: datetime) -> str:
    """Como `toISOString()` en el navegador: UTC con milisegundos y `Z`."""
    t = t.astimezone(UTC)
    return t.strftime("%Y-%m-%dT%H:%M:%S.") + f"{t.microsecond // 1000:03d}Z"


def datos_respuesta(a: Anotacion, r: Json, ahora: str) -> Json:
    """Los campos que escribe quien responde. Lo vigente (la respuesta anterior y la réplica del autor) pasa al final
    del `hilo`; `commit` y `replica` que ya no corresponden se borran."""
    datos = {
        "respuesta": r["respuesta"].strip(),
        "cierre": r["cierre"],
        "respondido": ahora,
        "estado": "abierta" if r["cierre"] == "pregunta" else "resuelta",
    }
    if r.get("commit"):
        datos["commit"] = r["commit"]
    elif a.get("commit"):
        datos["commit"] = BORRAR
    hilo = [h for h in a.get("hilo") or [] if isinstance(h, dict)]
    previo = len(hilo)
    if a.get("respuesta") or a.get("cierre"):
        h = {"de": "editor", "texto": (a.get("respuesta") or "").strip()}
        h.update({k: a[k] for k in ("cierre", "commit") if a.get(k)})
        if a.get("respondido"):
            h["cuando"] = a["respondido"]
        hilo.append(h)
    if (a.get("replica") or "").strip():
        hilo.append({"de": "autor", "texto": a["replica"].strip()})
    if a.get("replica") is not None:
        datos["replica"] = BORRAR
    if len(hilo) > previo:
        datos["hilo"] = hilo
    return datos


def _validar(r: Json, por_id: dict[str, Anotacion], versiones: dict[str, int]) -> str | None:
    rid = r.get("id")
    if not isinstance(rid, str) or rid not in por_id:
        return f"{rid!r}: no está en la colección"
    if r.get("cierre") not in CIERRES:
        return f"{rid}: cierre {r.get('cierre')!r}; debe ser {', '.join(CIERRES)}"
    if not isinstance(r.get("respuesta"), str) or not r["respuesta"].strip():
        return f"{rid}: sin respuesta"
    if r.get("commit") is not None and not isinstance(r["commit"], str):
        return f"{rid}: el commit debe ser texto"
    if rid not in versiones:
        return f"{rid}: falta su versión (pasa con --versiones lo que devolvió la lectura de la colección)"
    return None


def escrituras(
    anots: list[Anotacion],
    respuestas: list[Json],
    versiones: dict[str, int],
    coleccion: str = "anotaciones",
    ahora: datetime | None = None,
    avisos: list[str] | None = None,
) -> list[Json]:
    """Las escrituras de `ArtifactData` (acción «batch») que dejan esas respuestas en la base. Lanza ValueError con
    todos los problemas si alguna respuesta no es válida; `avisos` recibe lo que no impide escribir (responder algo
    que no estaba pendiente)."""
    por_id = _por_id(anots)
    problemas = [p for r in respuestas if (p := _validar(r, por_id, versiones))]
    # sólo las ids de texto: las que faltan o no lo son ya son un problema de `_validar`
    vistas = [r["id"] for r in respuestas if isinstance(r.get("id"), str)]
    problemas += [f"{i}: respondida dos veces" for i in sorted({i for i in vistas if vistas.count(i) > 1})]
    if problemas:
        raise ValueError("; ".join(problemas))
    marca = iso(ahora or datetime.now(UTC))
    salida = []
    for r in respuestas:
        a = por_id[r["id"]]
        if avisos is not None and not motivo(a):
            avisos.append(f"{a['id']}: no estaba pendiente (estado {a.get('estado')}, cierre {a.get('cierre')})")
        salida.append(
            {
                "op": "update",
                "collection": coleccion,
                "doc_id": a["id"],
                "data": datos_respuesta(a, r, marca),
                "if_version": versiones[a["id"]],
            }
        )
    return salida


def en_lotes(escritas: list[Json]) -> list[list[Json]]:
    """Reparte las escrituras en lotes que caben en una llamada «batch» (50 escrituras, menos de 1 MiB). El tamaño se
    mide con los caracteres no ASCII escapados (lo más que pueden ocupar); una escritura que no cabe sola es un
    error."""
    lotes: list[list[Json]] = [[]]
    tam = 0
    for e in escritas:
        n = len(json.dumps(e))
        if n > MAX_BYTES:
            raise ValueError(f"{e.get('doc_id')}: la escritura ocupa {n} bytes, más de lo que cabe en un lote")
        if lotes[-1] and (len(lotes[-1]) >= MAX_ESCRITURAS or tam + n > MAX_BYTES):
            lotes.append([])
            tam = 0
        lotes[-1].append(e)
        tam += n
    return lotes if lotes[0] else []


def aplicar_update(doc: Anotacion, datos: Json) -> Anotacion:
    """Lo que queda de `doc` tras un `update` con `datos` (fusión de primer nivel; `__delete__` quita el campo).
    Sirve para comprobar el resultado antes de escribir."""
    nuevo = dict(doc)
    for k, v in datos.items():
        if v == BORRAR:
            nuevo.pop(k, None)
        else:
            nuevo[k] = v
    return nuevo
