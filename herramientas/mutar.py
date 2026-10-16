"""Verificación por mutación: cada caso rompe el código donde el fallo ocurriría, corre la sonda que debería notarlo
y deja el archivo como estaba, pase lo que pase. Un caso «no cae» es un control (la sonda no alarma por un cambio que
no rompe nada) o un mutante equivalente anotado como tal.

Uso, desde la raíz del repositorio (con `pip install -e ".[dev]"`, `npm install` y el ejemplo construido):

    python herramientas/mutar.py herramientas/mutantes/*.json
    python herramientas/mutar.py --solo-comprobar herramientas/mutantes/*.json   # ¿entra cada mutante?
    python herramientas/mutar.py -k ficha herramientas/mutantes/pagina.json        # sólo los casos que dicen «ficha»

Cada archivo de `herramientas/mutantes/` es una lista de casos:
    archivo, viejo, nuevo   el reemplazo (`viejo` debe aparecer una sola vez: un mutante que no entra no prueba nada);
                            o `cambios`, una lista de [viejo, nuevo] que se aplican juntos (dos defensas a la vez)
    sonda                   web (pruebas de navegador `-g pruebas`, con la página reconstruida), modulos
                            (herramientas/modulos.mjs --comprobar; `mensaje`, si está, debe salir en lo que dice) o
                            nucleo (tsc del núcleo y la prueba de sus nombres)
    espera, que             «cae» o «no cae», y qué protege el caso
Variables: CHROMIUM, la ruta a un Chromium para las pruebas de navegador (ver CONTRIBUTING.md).
Sale con 1 si algún caso no entra o no hace lo que espera.
"""

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any


def pagina() -> None:
    orden = shutil.which("lector-anotaciones")
    base = [orden] if orden else [sys.executable, "-m", "lector_anotaciones"]
    subprocess.run([*base, "pagina", "--salida", "web/index.html"], check=True, capture_output=True)


def sonda(caso: dict[str, Any]) -> tuple[bool, str]:
    """Corre la sonda del caso; devuelve si cayó y la última línea útil de lo que dijo."""
    tipo = caso["sonda"]
    if tipo == "web":
        pagina()
        r = subprocess.run(
            ["npx", "playwright", "test", "--workers=1", "-g", caso["pruebas"]], capture_output=True, text=True
        )
        cayo = r.returncode != 0
    elif tipo == "modulos":
        r = subprocess.run(["node", "herramientas/modulos.mjs", "--comprobar"], capture_output=True, text=True)
        cayo = r.returncode != 0 and caso.get("mensaje", "") in r.stdout + r.stderr
    elif tipo == "nucleo":
        t = subprocess.run(["npx", "tsc", "-p", "tsconfig.nucleo.json"], capture_output=True, text=True)
        n = subprocess.run(["node", "--test", "tests/js/nucleo.test.js"], capture_output=True, text=True)
        r = t if t.returncode else n
        cayo = bool(t.returncode or n.returncode)
    else:
        raise SystemExit(f"sonda desconocida: {tipo}")
    lineas = [x.strip() for x in (r.stdout + r.stderr).splitlines() if x.strip()]
    return cayo, (lineas[-1] if lineas else "")[:100]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("archivos", nargs="+", type=Path)
    ap.add_argument("--solo-comprobar", action="store_true", help="sólo mira que cada mutante entre")
    ap.add_argument("-k", default="", help="sólo los casos cuyo texto contenga esto")
    op = ap.parse_args()
    bien = True
    for archivo in op.archivos:
        for caso in json.loads(archivo.read_text(encoding="utf-8")):
            if op.k and op.k not in json.dumps(caso, ensure_ascii=False):
                continue
            ruta = Path(caso["archivo"])
            original = ruta.read_text(encoding="utf-8")
            cambios = caso.get("cambios") or [[caso["viejo"], caso["nuevo"]]]
            etiqueta = f"{archivo.stem}: {caso['que']} ({ruta.name})"
            no_entran = [(v, original.count(v)) for v, _ in cambios if original.count(v) != 1]
            if no_entran:
                for v, veces in no_entran:
                    print(f"NO ENTRA ({veces} veces) | {etiqueta} | {v[:60]!r}")
                bien = False
                continue
            if op.solo_comprobar:
                continue
            mutado = original
            for v, n in cambios:
                mutado = mutado.replace(v, n)
            try:
                ruta.write_text(mutado, encoding="utf-8")
                cayo, dijo = sonda(caso)
            finally:
                ruta.write_text(original, encoding="utf-8")
                if caso["sonda"] == "web":
                    pagina()
            ok = cayo == (caso["espera"] == "cae")
            bien &= ok
            print(f"{'OK ' if ok else 'MAL'} {'cae   ' if cayo else 'no cae'} (espera {caso['espera']}) | {etiqueta}")
            if not ok:
                print(f"    {dijo}")
    return 0 if bien else 1


if __name__ == "__main__":
    sys.exit(main())
