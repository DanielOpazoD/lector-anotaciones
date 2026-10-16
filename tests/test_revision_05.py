"""La revisión independiente de `pendientes`, `responder` y `aplicar` (0.5): cada prueba falló con el defecto que
nombra y pasa con su arreglo."""

from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path

import pytest

from lector_anotaciones.aplicar import aplicar
from lector_anotaciones.cli import main
from lector_anotaciones.markdown import parse_texto
from lector_anotaciones.responder import escrituras, motivo

RAIZ = Path(__file__).resolve().parent.parent
NODE = shutil.which("node")


def sub(i: str, cita: str, sugerencia: str, src: str, **extra) -> dict:
    return {
        "id": i,
        "tipo": "subrayado",
        "pid": "c-b1",
        "inicio": 0,
        "fin": len(cita),
        "cita": cita,
        "color": "revisar",
        "sugerencia": sugerencia,
        "src": src,
        "estado": "abierta",
        **extra,
    }


def fuentes(tmp_path: Path, texto: str, nombre: str = "01.md", crlf: bool = False) -> Path:
    d = tmp_path / "fuentes"
    d.mkdir(exist_ok=True)
    (d / nombre).write_bytes(texto.replace("\n", "\r\n" if crlf else "\n").encode("utf-8"))
    return d


# ---------------------------------------------------------------- 1. la propuesta nunca llega a la base (página)
@pytest.mark.skipif(NODE is None, reason="hace falta node")
def test_editar_la_sugerencia_marca_el_campo_para_el_update_de_la_base():
    llamadas = [["marcarCampos", [{}, {"sugerencia": "la casa"}, {"sugerencia": "la casa grande"}]]]
    salida = subprocess.run(
        [NODE, str(RAIZ / "tests" / "js" / "evaluar.mjs")],
        input=json.dumps(llamadas),
        check=True,
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert json.loads(salida.stdout) == [{"sugerencia": True}], "si no, SINC.escritura manda sólo {editado}"


# ---------------------------------------------------------------- 2. aplicar dos veces aplica dos veces
def test_aplicar_escribir_dos_veces_no_duplica(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nEntró en la casa y se sentó.\n")
    a = sub("g1", "la casa", "la casa grande", "01.md:3", antes="Entró en ", despues=" y se sentó.")
    js = tmp_path / "a.json"
    js.write_text(json.dumps([a]), encoding="utf-8")
    for _ in range(2):
        assert main(["aplicar", str(js), "--fuentes", str(d), "--escribir"]) == 0
    assert (d / "01.md").read_text(encoding="utf-8") == "# C\n\nEntró en la casa grande y se sentó.\n"


def test_reabierta_ya_aplicada_no_se_vuelve_a_aplicar(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nEntró en la casa grande y se sentó.\n")
    a = sub(
        "g1",
        "la casa",
        "la casa grande",
        "01.md:3",
        antes="Entró en ",
        despues=" y se sentó.",
        respuesta="Aplicada la propuesta: «la casa grande».",
        cierre="atendida",
        respondido="T1",
        revisado="T1",
    )
    _, archivos = aplicar([a], d)
    assert not archivos, "la propuesta ya está en la fuente"


# ---------------------------------------------------------------- 3. coincidencia única sin contexto / dentro de palabra
def test_reubicar_en_otro_parrafo_exige_contexto(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nAyer la paciente refirió dolor.\n\nAl día siguiente el paciente pidió el alta.\n")
    a = sub("r1", "el paciente", "el enfermo", "01.md:3", antes="Ayer ", despues=" refirió dolor.")
    res, archivos = aplicar([a], d)
    assert res[0].estado == "no encontrada" and not archivos


def test_no_cambia_un_trozo_de_otra_palabra(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nTodos llegaron tarde.\n")
    _res, archivos = aplicar([sub("s1", "dos", "tres", "01.md:3", antes="Eran ", despues=".")], d)
    assert not archivos, archivos and next(iter(archivos.values())).texto


# ---------------------------------------------------------------- 4. CRLF
def test_escribir_conserva_los_finales_de_linea(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nUna frase corta.\n\nOtra.\n", crlf=True)
    js = tmp_path / "a.json"
    js.write_text(json.dumps([sub("c1", "frase", "oración", "01.md:3")]), encoding="utf-8")
    assert main(["aplicar", str(js), "--fuentes", str(d), "--escribir"]) == 0
    assert (d / "01.md").read_bytes() == "# C\r\n\r\nUna oración corta.\r\n\r\nOtra.\r\n".encode()


# ---------------------------------------------------------------- 5. src fuera de --fuentes
def test_no_escribe_fuera_de_las_fuentes(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nTexto.\n")
    fuera = tmp_path / "perfil.sh"
    fuera.write_text("alias ls=1\n", encoding="utf-8")
    anots = [sub("t1", "alias", "rm -rf ~; alias", "../perfil.sh:1"), sub("t2", "alias", "X", f"{fuera}:1")]
    res, archivos = aplicar(anots, d)
    assert not archivos and {r.estado for r in res} == {"sin archivo"}


# ---------------------------------------------------------------- 6. --respuestas sin --escribir
def test_respuestas_sin_escribir_no_dice_aplicada(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nEntró en la casa y se sentó.\n")
    js, resp = tmp_path / "a.json", tmp_path / "r.json"
    js.write_text(json.dumps([sub("g1", "la casa", "la casa grande", "01.md:3")]), encoding="utf-8")
    codigo = main(["aplicar", str(js), "--fuentes", str(d), "--respuestas", str(resp)])
    assert codigo != 0 or json.loads(resp.read_text(encoding="utf-8")) == [], "nada se escribió en las fuentes"


# ---------------------------------------------------------------- 7. --commit en descartadas y preguntas
def test_commit_por_defecto_solo_en_las_atendidas(tmp_path: Path):
    anots = [{"id": i, "tipo": "general", "nota": "x", "estado": "abierta"} for i in ("a1", "a2", "a3")]
    resp = [
        {"id": "a1", "respuesta": "Hecho.", "cierre": "atendida"},
        {"id": "a2", "respuesta": "No: el dato es correcto.", "cierre": "descartada"},
        {"id": "a3", "respuesta": "¿Y el título?", "cierre": "pregunta"},
    ]
    rutas = {n: tmp_path / f"{n}.json" for n in ("a", "r", "v")}
    rutas["a"].write_text(json.dumps(anots), "utf-8")
    rutas["r"].write_text(json.dumps(resp), "utf-8")
    rutas["v"].write_text('{"a1":1,"a2":1,"a3":1}', "utf-8")
    salida = tmp_path / "lote.json"
    main(
        [
            "responder",
            str(rutas["a"]),
            str(rutas["r"]),
            "--versiones",
            str(rutas["v"]),
            "--commit",
            "9f1e2d3",
            "--salida",
            str(salida),
        ]
    )
    commits = {e["doc_id"]: e["data"].get("commit") for e in json.loads(salida.read_text("utf-8"))}
    assert commits == {"a1": "9f1e2d3", "a2": None, "a3": None}


# ---------------------------------------------------------------- 8. énfasis: el `_` es literal en el dialecto
def test_guion_bajo_literal_no_engana_al_control_de_enfasis(tmp_path: Path):
    d = fuentes(tmp_path, "# C\n\nVer mi_archivo y *uno dos* tres *cuatro cinco*.\n")
    res, _ = aplicar([sub("e", "dos tres cuatro", "siete", "01.md:3")], d)
    assert res[0].estado == "énfasis cortado"


# ---------------------------------------------------------------- 9. líneas contadas como construir
def test_las_lineas_se_cuentan_como_en_construir(tmp_path: Path):
    texto = "# C\n\nUno\x0cdos.\n\nSegundo párrafo: el dato.\n\nTercero: el dato.\n"
    assert [b["src"] for s in parse_texto(texto, "01.md") for b in s["bloques"]][-1] == "01.md:7"
    d = fuentes(tmp_path, texto)
    _, archivos = aplicar([sub("e", "el dato", "la cifra", "01.md:7")], d)
    assert archivos[d / "01.md"].texto.endswith("párrafo: el dato.\n\nTercero: la cifra.\n")


# ---------------------------------------------------------------- 10. la propuesta no debe cambiar la estructura
@pytest.mark.parametrize(
    ("cuerpo", "linea", "cita", "sugerencia"),
    [
        ("| Dosis | Vía |\n|---|---|\n| 10 mg | oral |\n", 5, "10 mg", "10 mg | 20 mg"),
        ("- Primero el dato.\n- Luego la inferencia.\n", 3, "el dato", "el dato\nobservado"),
        ("Párrafo con texto.\n", 3, "con texto", "con\n\n# texto"),
    ],
)
def test_la_propuesta_no_rompe_la_estructura(tmp_path: Path, cuerpo, linea, cita, sugerencia):
    texto = "# C\n\n" + cuerpo
    d = fuentes(tmp_path, texto)
    _, archivos = aplicar([sub("e", cita, sugerencia, f"01.md:{linea}")], d)

    def forma(t):
        return [
            (s["id"], [(b["t"], len(b["html"]) if isinstance(b["html"], list) else 0) for b in s["bloques"]])
            for s in parse_texto(t)
        ]

    nuevo = archivos[d / "01.md"].texto if archivos else texto
    assert forma(nuevo) == forma(texto)
    if "|" in cuerpo:
        assert [len(f) for b in parse_texto(nuevo)[0]["bloques"] for f in b["html"]] == [2, 2]


# ---------------------------------------------------------------- 11. errores de la línea de órdenes
def test_fuentes_inexistente_es_error(tmp_path: Path):
    js = tmp_path / "a.json"
    js.write_text(json.dumps([sub("g1", "a", "b", "01.md:3")]), "utf-8")
    assert main(["aplicar", str(js), "--fuentes", str(tmp_path / "no-existe")]) == 2


@pytest.mark.parametrize(
    "respuestas", ['["g1"]', '[{"id": ["g1"], "respuesta": "x", "cierre": "atendida"}]', '{"g1": "Hecho."}']
)
def test_respuestas_mal_formadas_son_error_y_no_traza(tmp_path: Path, respuestas):
    a, r, v = tmp_path / "a.json", tmp_path / "r.json", tmp_path / "v.json"
    a.write_text(json.dumps([{"id": "g1", "tipo": "general", "estado": "abierta"}]), "utf-8")
    r.write_text(respuestas, "utf-8")
    v.write_text('{"g1": 1}', "utf-8")
    assert main(["responder", str(a), str(r), "--versiones", str(v)]) == 2


# ---------------------------------------------------------------- 12. lotes viejos que quedan junto a los nuevos
def test_responder_no_deja_lotes_de_una_corrida_anterior(tmp_path: Path):
    anots = [{"id": f"a{i}", "tipo": "general", "estado": "abierta"} for i in range(120)]
    a, r, v = tmp_path / "a.json", tmp_path / "r.json", tmp_path / "v.json"
    a.write_text(json.dumps(anots), "utf-8")
    v.write_text(json.dumps({x["id"]: 1 for x in anots}), "utf-8")
    r.write_text(json.dumps([{"id": x["id"], "respuesta": "Hecho.", "cierre": "atendida"} for x in anots]), "utf-8")
    assert main(["responder", str(a), str(r), "--versiones", str(v), "--salida", str(tmp_path / "lote.json")]) == 0
    r.write_text(
        json.dumps([{"id": x["id"], "respuesta": "Hecho.", "cierre": "atendida"} for x in anots[:60]]), "utf-8"
    )
    assert main(["responder", str(a), str(r), "--versiones", str(v), "--salida", str(tmp_path / "lote.json")]) in (0, 2)
    assert not (tmp_path / "lote-3.json").exists(), "lote-3 de la corrida anterior sigue ahí, con if_version válidos"


# ---------------------------------------------------------------- 13. reabierta sin cierre: fuera de las dos bandejas
def test_respuesta_sin_cierre_reabierta_espera_a_quien_edita():
    a = {
        "id": "l",
        "tipo": "general",
        "nota": "Falta el título.",
        "respuesta": "Hecho.",
        "estado": "abierta",
        "revisado": "2026-10-16T10:00:00.000Z",
    }
    assert motivo(a) == "reabierta"


# ---------------------------------------------------------------- 14. ids duplicados en la colección
def test_ids_duplicados_en_la_coleccion_son_error():
    anots = [
        {"id": "z", "tipo": "general", "nota": "una", "estado": "abierta"},
        {
            "id": "z",
            "tipo": "general",
            "nota": "otra",
            "estado": "abierta",
            "respuesta": "?",
            "cierre": "pregunta",
            "replica": "Sí",
        },
    ]
    with pytest.raises(ValueError):
        escrituras(anots, [{"id": "z", "respuesta": "Hecho.", "cierre": "atendida"}], {"z": 2})
