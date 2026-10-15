"""Genera los libros de muestra con que se prueban los importadores de la página (EPUB y Word).

Son ZIP armados a mano, deterministas (fecha fija) y pequeños, con los casos que el importador debe resolver:
títulos de dos niveles y subtítulos, negrita y cursiva, listas con y sin número, cita, tabla, figura con su
leyenda (en Word, dentro de una tabla de una columna usada como marco, como hacen muchos maquetadores), un capítulo sin encabezado (toma el título del índice del EPUB), texto borrado con control de cambios
(no debe aparecer) y un enlace (sólo su texto).

Uso: python tests/fixtures/generar.py   (escribe ejemplo.epub, ejemplo-ncx.epub y ejemplo.docx junto a este archivo)
"""

from __future__ import annotations

import base64
import zipfile
from pathlib import Path

AQUI = Path(__file__).resolve().parent
FECHA = (2026, 1, 1, 0, 0, 0)
# PNG de 1×1 píxel
PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)


def _zip(destino: Path, entradas: list[tuple[str, bytes | str]]) -> None:
    with zipfile.ZipFile(destino, "w") as z:
        for nombre, datos in entradas:
            info = zipfile.ZipInfo(nombre, date_time=FECHA)
            info.compress_type = zipfile.ZIP_STORED if nombre == "mimetype" else zipfile.ZIP_DEFLATED
            z.writestr(info, datos.encode("utf-8") if isinstance(datos, str) else datos)


CONTAINER = """<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/contenido.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>"""


def _xhtml(titulo: str, cuerpo: str) -> str:
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="es">
<head><title>{titulo}</title><link rel="stylesheet" href="estilo.css"/></head>
<body>{cuerpo}</body></html>"""


CAP1 = _xhtml(
    "Libro de muestra",
    """<section><h1>Parte I. Lo que se ve</h1>
<h2>Capítulo 1. Hechos</h2>
<p>Un hecho es lo que se <strong>observó</strong>, no lo que se <em>concluyó</em> de la observación.</p>
<p>Segundo párrafo con un <a href="cap2.xhtml#x">enlace</a> y&#160;espacios   de más.
  <br/>Sigue tras un salto.</p>
<h3>Tres maneras</h3>
<ul><li>Dar por hecho lo contado.</li><li>Dar por hecho lo <b>inferido</b>.</li></ul>
<ol><li>Primero.</li><li>Segundo.</li></ol>
<blockquote><p>Una frase bien escrita dice lo que se sabe.</p></blockquote>
<table><tr><th>Capa</th><th>Pregunta</th></tr><tr><td>Hecho</td><td>¿Qué vi?</td></tr></table>
<figure><img src="img/punto.png" alt="Un punto"/><figcaption>Figura 1. Un punto <i>mínimo</i>.</figcaption></figure>
<script>alert("no")</script><p onclick="x()">Texto con <span style="color:red">estilo</span> &lt;etiqueta&gt; &amp; más.</p>
</section>""",
)
CAP2 = _xhtml(
    "Libro de muestra",
    """<div><p>Este capítulo no trae encabezado: su título sale del índice.</p><p>Y un segundo párrafo.</p></div>""",
)
NAV = _xhtml(
    "Índice",
    """<nav epub:type="toc"><ol><li><a href="cap1.xhtml">Capítulo 1. Hechos</a></li><li><a href="cap2.xhtml">Capítulo 2. Sin encabezado</a></li></ol></nav>""",
)


def _opf(con_nav: bool) -> str:
    nav = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' if con_nav else ""
    ncx = "" if con_nav else '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>'
    toc = "" if con_nav else ' toc="ncx"'
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="id">muestra</dc:identifier><dc:title>Libro de muestra EPUB</dc:title>
    <dc:creator>Autora de Muestra</dc:creator><dc:language>es</dc:language>
  </metadata>
  <manifest>
    {nav}{ncx}
    <item id="c1" href="cap1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="cap2.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="img/punto.png" media-type="image/png"/>
    <item id="css" href="estilo.css" media-type="text/css"/>
  </manifest>
  <spine{toc}><itemref idref="c1"/><itemref idref="c2"/></spine>
</package>"""


NCX = """<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap>
<navPoint id="p1"><navLabel><text>Capítulo 1. Hechos</text></navLabel><content src="cap1.xhtml"/></navPoint>
<navPoint id="p2"><navLabel><text>Capítulo 2. Sin encabezado</text></navLabel><content src="cap2.xhtml#inicio"/></navPoint>
</navMap></ncx>"""


def epub(destino: Path, con_nav: bool = True) -> None:
    entradas = [
        ("mimetype", "application/epub+zip"),
        ("META-INF/container.xml", CONTAINER),
        ("OEBPS/contenido.opf", _opf(con_nav)),
        ("OEBPS/cap1.xhtml", CAP1),
        ("OEBPS/cap2.xhtml", CAP2),
        ("OEBPS/img/punto.png", PNG),
        ("OEBPS/estilo.css", "p { margin: 0 }"),
    ]
    entradas.append(("OEBPS/nav.xhtml", NAV) if con_nav else ("OEBPS/toc.ncx", NCX))
    _zip(destino, entradas)


W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
R = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
A = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"'
WP = 'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"'


def _p(texto: str = "", estilo: str = "", runs: str = "", num: tuple[int, int] | None = None) -> str:
    ppr = ""
    if estilo or num:
        ppr = "<w:pPr>"
        if estilo:
            ppr += f'<w:pStyle w:val="{estilo}"/>'
        if num:
            ppr += f'<w:numPr><w:ilvl w:val="{num[1]}"/><w:numId w:val="{num[0]}"/></w:numPr>'
        ppr += "</w:pPr>"
    cuerpo = runs or (f'<w:r><w:t xml:space="preserve">{texto}</w:t></w:r>' if texto else "")
    return f"<w:p>{ppr}{cuerpo}</w:p>"


def _r(texto: str, b: bool = False, i: bool = False) -> str:
    rpr = ""
    if b or i:
        rpr = "<w:rPr>" + ("<w:b/>" if b else "") + ("<w:i/>" if i else "") + "</w:rPr>"
    return f'<w:r>{rpr}<w:t xml:space="preserve">{texto}</w:t></w:r>'


DOCUMENTO = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document {W} {R} {A} {WP}><w:body>
{_p("Libro de muestra Word", "Ttulo")}
{_p("Un subtítulo", "Subttulo")}
{_p("Parte I. Lo que se ve", "Ttulo1")}
{_p("Capítulo 1. Hechos", "Ttulo2")}
{_p(runs=_r("Un hecho es lo que se ") + _r("observó", b=True) + _r(", no lo que se ") + _r("concluyó", i=True) + _r(" de la observación."))}
{_p(runs=_r("Texto con ") + "<w:del><w:r><w:delText>BORRADO</w:delText></w:r></w:del>" + '<w:ins><w:r><w:t xml:space="preserve">insertado </w:t></w:r></w:ins>' + '<w:hyperlink r:id="rId9"><w:r><w:t>un enlace</w:t></w:r></w:hyperlink>' + _r(" y &lt;signos&gt; &amp; más."))}
{_p("Tres maneras", "Ttulo3")}
{_p("Dar por hecho lo contado.", "Prrafodelista", num=(1, 0))}
{_p("Dar por hecho lo inferido.", "Prrafodelista", num=(1, 0))}
{_p("Primero.", "Prrafodelista", num=(2, 0))}
{_p("Segundo.", "Prrafodelista", num=(2, 0))}
{_p("Una frase bien escrita dice lo que se sabe.", "Cita")}
<w:tbl><w:tr><w:tc>{_p(runs=_r("Capa", b=True))}</w:tc><w:tc>{_p("Pregunta")}</w:tc></w:tr><w:tr><w:tc>{_p("Hecho")}</w:tc><w:tc>{_p("¿Qué vi?")}</w:tc></w:tr></w:tbl>
<w:tbl><w:tr><w:tc><w:p><w:r><w:drawing><wp:inline><wp:docPr id="1" name="Imagen 1"/><a:graphic><a:graphicData><a:blip r:embed="rId5"/></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>
{_p("Figura 1. Un punto mínimo.", "Descripcin")}</w:tc></w:tr></w:tbl>
{_p("")}
{_p("Capítulo 2. Inferencias", "Ttulo2")}
{_p("Una inferencia va más allá de lo observado.")}
<w:sectPr/>
</w:body></w:document>"""

ESTILOS = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles {W}>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo"><w:name w:val="Title"/></w:style>
<w:style w:type="paragraph" w:styleId="Subttulo"><w:name w:val="Subtitle"/></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo1"><w:name w:val="heading 1"/><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo2"><w:name w:val="heading 2"/><w:basedOn w:val="Ttulo1"/><w:pPr><w:outlineLvl w:val="1"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Ttulo3"><w:name w:val="heading 3"/><w:pPr><w:outlineLvl w:val="2"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Prrafodelista"><w:name w:val="List Paragraph"/></w:style>
<w:style w:type="paragraph" w:styleId="Cita"><w:name w:val="Quote"/></w:style>
<w:style w:type="paragraph" w:styleId="Descripcin"><w:name w:val="caption"/></w:style>
</w:styles>"""

NUMERACION = f"""<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering {W}>
<w:abstractNum w:abstractNumId="10"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
<w:abstractNum w:abstractNumId="20"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="10"/></w:num>
<w:num w:numId="2"><w:abstractNumId w:val="20"/></w:num>
</w:numbering>"""

RELS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/>
<Relationship Id="rId9" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="https://example.org" TargetMode="External"/>
</Relationships>"""

CORE = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:title></dc:title><dc:creator>Autor de Muestra</dc:creator></cp:coreProperties>"""

TIPOS = """<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>"""


def docx(destino: Path) -> None:
    _zip(
        destino,
        [
            ("[Content_Types].xml", TIPOS),
            ("word/document.xml", DOCUMENTO),
            ("word/styles.xml", ESTILOS),
            ("word/numbering.xml", NUMERACION),
            ("word/_rels/document.xml.rels", RELS),
            ("word/media/image1.png", PNG),
            ("docProps/core.xml", CORE),
        ],
    )


if __name__ == "__main__":
    epub(AQUI / "ejemplo.epub")
    epub(AQUI / "ejemplo-ncx.epub", con_nav=False)
    docx(AQUI / "ejemplo.docx")
    print("ok", *(p.name for p in sorted(AQUI.glob("ejemplo*"))))
