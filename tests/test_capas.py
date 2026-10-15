from lector_anotaciones.capas import ConfigCapas, calcular_capas, citas_narrativas, frases_largas, repeticiones


def test_frases_largas_mide_palabras_por_oracion():
    corta = "Una frase corta. Otra también."
    larga = "Esta oración " + "tiene muchas palabras " * 20 + "y termina aquí."
    assert frases_largas(corta, 50) == []
    rangos = frases_largas(corta + " " + larga, 50)
    assert len(rangos) == 1
    a, b = rangos[0]
    assert (corta + " " + larga)[a:b].startswith("Esta oración") and (corta + " " + larga)[a:b].endswith("aquí.")


def test_muletillas_y_terminos_con_limites_de_palabra():
    texto = "Por eso lo digo; exactamente eso. El relleno capilar no es el llene capilar."
    capas = calcular_capas(texto, ConfigCapas(terminos_retirados=["relleno capilar"]))
    assert [texto[a:b] for a, b in capas["mu"]] == ["Por eso", "exactamente"]
    assert [texto[a:b] for a, b in capas["tr"]] == ["relleno capilar"]
    assert "fl" not in capas and "cn" not in capas


def test_repeticiones_cercanas_marcan_ambas_apariciones():
    texto = (
        "La incertidumbre manda; la incertidumbre decide. Lejos, muy lejos, " + "x " * 80 + "incertidumbre otra vez."
    )
    rangos = repeticiones(texto, 7, 120)
    assert [texto[a:b] for a, b in rangos] == ["incertidumbre", "incertidumbre"], "la tercera está fuera de la ventana"


def test_citas_narrativas():
    texto = "Groopman (2007) mostró algo; otros lo dijeron antes (Croskerry, 2003). Winograd y Flores (1986) también."
    assert [texto[a:b] for a, b in citas_narrativas(texto)] == ["Groopman (2007)", "Winograd y Flores (1986)"]


def test_capas_vacias_no_aparecen():
    assert calcular_capas("Nada que señalar.") == {}


def test_los_rangos_salen_en_unidades_utf16():
    texto = "Un 😀 emoji antes y por eso la capa se corre."
    capas = calcular_capas(texto)
    a, b = capas["mu"][0]
    # en JavaScript el emoji ocupa dos unidades: el rango va una posición más a la derecha que en Python
    assert texto.index("por eso") == 19 and [a, b] == [20, 27]
    sin = "Un X emoji antes y por eso la capa no se corre."
    assert calcular_capas(sin)["mu"] == [[19, 26]]
