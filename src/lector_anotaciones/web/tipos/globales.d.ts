// Tipos de lo que la página comparte entre sus fragmentos y con el núcleo. Los usa `tsc --checkJs` (npm run tipos) para
// revisar las llamadas; no se empaquetan en index.html.

/** Una anotación, como se guarda en la base y en el navegador (ver docs/FORMATO_ANOTACIONES.md). */
interface Anotacion {
  id: string;
  tipo: 'subrayado' | 'pagina' | 'capitulo' | 'general';
  sid?: string | null;
  sidTitulo?: string | null;
  pid?: string;
  src?: string;
  pagina?: number;
  inicio?: number;
  fin?: number;
  cita?: string;
  antes?: string;
  despues?: string;
  color?: string;
  grupo?: string;
  nota?: string;
  /** En un subrayado, el texto que el autor propone en lugar de la cita; vacío o igual a la cita, nada. */
  sugerencia?: string;
  estado?: 'abierta' | 'resuelta';
  creado?: string;
  editado?: string;
  libro?: string | null;
  bh?: string;
  autor?: string | null;
  respuesta?: string;
  cierre?: 'atendida' | 'descartada' | 'pregunta';
  commit?: string;
  respondido?: string;
  replica?: string;
  revisado?: string;
  /** La conversación anterior, de la más vieja a la más nueva; lo vigente sigue en respuesta y replica. */
  hilo?: {
    de: 'editor' | 'autor';
    texto: string;
    cierre?: 'atendida' | 'descartada' | 'pregunta';
    commit?: string;
    cuando?: string;
  }[];
}

/** Un bloque de libro.json: párrafo, título, lista, cita, tabla, figura o portada (ver docs/FORMATO_LIBRO.md). */
interface Bloque {
  id: string;
  t: 'p' | 'h3' | 'h4' | 'ul' | 'ol' | 'quote' | 'table' | 'figure' | 'portada';
  /** Cadena (p, h3, h4, quote); lista de cadenas (ul, ol, portada); filas de celdas (table); figura. */
  html: string | string[] | string[][] | { src: string; caption?: string };
  src: string;
  pagina?: number | null;
  /** Huella del texto como lo muestra la página. */
  h?: string;
  /** El texto de la construcción anterior, si cambió. */
  anterior?: string;
  /** Capas editoriales: clave → tramos [inicio, fin] en el texto mostrado. */
  m?: Record<string, [number, number][]>;
}
/** Una sección de libro.json. */
interface Seccion {
  id: string;
  titulo: string;
  nivel?: number;
  src?: string;
  pagina?: number | null;
  bloques: Bloque[];
}
/** libro.json (docs/FORMATO_LIBRO.md). */
interface Libro {
  formato?: number;
  generador?: string;
  id?: string;
  titulo?: string;
  subtitulo?: string;
  autor?: string;
  generado?: string;
  fuentes?: string[];
  paginas_fisicas?: number | null;
  desfase_paginas?: number;
  inicio?: string | null;
  claves_anteriores?: string[];
  anterior_generado?: string | null;
  cambios?: number;
  capas?: Record<string, string>;
  secciones: Seccion[];
}

/** La sincronía de las anotaciones (nucleo/65-sincronia.js). */
interface Sincronia {
  anots: Record<string, Anotacion>;
  campos: Record<string, Record<string, boolean>>;
  sinGuardar: Record<string, string>;
  enVuelo: Record<string, number>;
  enBase: Record<string, number>;
  pendientes: string[];
  limpiarCampos(id: string, enBase?: Anotacion): void;
  cambiar(a: Anotacion, ahora: string): { previa: Anotacion | null; nueva: boolean };
  escritura(id: string): { modo: 'set' | 'update'; datos: Record<string, any>; anotacion: Anotacion } | null;
  alConfirmar(id: string, escrita: Anotacion): { estabaSinGuardar: boolean; soltarCopia: boolean };
  alRechazar(
    id: string,
    codigo: string,
    previa: Anotacion | null,
    verbo: string
  ): { permiso: boolean; conservada: boolean; restaurada: Anotacion | null };
  quitar(id: string): { anotacion: Anotacion; marca?: string; campos: Record<string, boolean> | null } | null;
  alBorrar(id: string): void;
  /** `datos`: el documento tal como está en la base (null si se borró). */
  alFoto(cambios: { tipo: string; id: string; datos: Record<string, any> | null }[]): boolean;
  fusionarLocal(
    local: Record<string, Anotacion>,
    campos: Record<string, Record<string, boolean>>,
    filtro?: (id: string, a: Anotacion) => boolean
  ): { nuevas: string[]; existentes: string[] };
  alRecuperar(r: { nuevas: string[]; existentes: string[] }): string[];
  tomarPendientes(yo: string | null): string[];
  alSubir(
    ids: string[],
    resultados: (true | string)[],
    escritas: Record<string, Anotacion>
  ): { soltar: string[]; fallidas: string[] };
  marcarSinSubir(): string[];
}

/** El estado de la vista (nucleo/58-vista.js). */
interface EstadoVista {
  secActual: string | null;
  tab: 'capitulo' | 'todas' | 'revisar' | 'buscar';
  filtro: string;
  filtroAutor: string;
  filtroEtiqueta: string;
  fichaFoco: string | null;
  revisadas: Record<string, number>;
  margen: boolean;
}
interface Vista {
  estado: EstadoVista;
  cambiar(parche: Partial<EstadoVista>): string[];
  alCambiar(claves: (keyof EstadoVista)[] | null, fn: (cambiadas: string[], estado: EstadoVista) => void): () => void;
  quitarFiltros(): string[];
  revisada(id: string): boolean;
}

/** Dónde quedó un subrayado en esta versión del libro (nucleo/30-ubicar.js). */
interface Ubicacion {
  /** null si se perdió. */
  pid: string | null;
  inicio: number;
  fin: number;
  estado: 'exacto' | 'reubicado' | 'perdido';
}

/** Las opciones de `importarLibro`: lo que necesita del entorno y lo que se le impone al libro. */
interface OpcionesImportar {
  /** El analizador de XML/HTML (DOMParser en el navegador): HTML, EPUB y Word lo necesitan; Markdown, texto y
   * libro.json, no. */
  parsear?: (texto: string, tipo: DOMParserSupportedType) => Document;
  /** Cómo descomprimir (EPUB y Word son zip); sin esto, DecompressionStream del navegador. */
  inflar?: (bytes: Uint8Array) => Promise<Uint8Array>;
  /** Título y autor si el archivo no los trae. */
  titulo?: string;
  autor?: string;
}

/** El armazón de un libro mientras se lee (nucleo/50-markdown.js): las secciones abiertas y la actual. */
interface EstadoLibro {
  figs: string;
  usados: Record<string, boolean>;
  secciones: Seccion[];
  sec: Seccion | null;
  nueva(titulo: string, nivel: number, src: string): Seccion;
  bloque(t: Bloque['t'], contenido: Bloque['html'], src: string): Bloque;
}

/** El núcleo (nucleo/*.js): todo lo que la página llama, con su tipo; un nombre que no está aquí es un error. */
interface Nucleo {
  crearSincronia(): Sincronia;
  crearVista(inicial?: Partial<EstadoVista>): Vista;
  migrarClaves(local: Record<string, Anotacion>, viejas: Record<string, Record<string, Anotacion>>): number;
  esTransitorio(codigo?: string): boolean;
  esDePermiso(codigo: string, tamano: number, verbo: string): boolean;
  porRevisar(a: Anotacion, yo: string | null): boolean;
  marcaRevision(a: Anotacion, ahora: string): string;
  reabierta(a: Anotacion): boolean;
  propuesta(a: Anotacion): string;
  lineaHilo(h: NonNullable<Anotacion['hilo']>[number]): string;
  vecina<T extends { id: string }>(
    lista: T[],
    actual: string | null,
    d: number,
    orden?: { de: (x: T) => number; clave: number | null }
  ): number;
  apilar(
    items: { id: string; y: number | null; h: number }[],
    activo: string | null,
    separacion?: number
  ): { tops: Record<string, number>; alto: number };
  marcarCampos(marcas: Record<string, boolean>, antes: Anotacion, despues: Anotacion): Record<string, boolean>;
  fundirBorrador(deBase: Anotacion, borrador: Anotacion, campos?: Record<string, boolean>): Anotacion;
  igual(a: unknown, b: unknown): boolean;
  CAMPOS_LECTOR: string[];
  /** Lo que le falta a un documento de fuera para ser una anotación que la página pueda mostrar; null si nada. */
  problemaDeAnotacion(a: unknown): string | null;
  seccionId(titulo: string, usados: Record<string, boolean>): string;
  /** HTML escapado con **negrita** y *cursiva*. */
  inline(s: string): string;
  estadoLibro(figs?: string): EstadoLibro;
  parsearMarkdown(archivos: { nombre: string; texto: string }[], figs?: string): Seccion[];
  normalizar(s: unknown): string;
  /** El texto de un fragmento HTML del lector: sin etiquetas y con las entidades resueltas. */
  textoDeHtml(h: unknown): string;
  escaparHtml(s: unknown): string;
  ordenado(o: any): any;
  slug(s: string, maximo?: number): string;
  etiquetasDe(a: Anotacion): string[];
  diffPalabras(antes: string, ahora: string): ['=' | '-' | '+', string][];
  buscarCita(txt: string, a: Anotacion): { i: number; puntos: number } | null;
  ubicarEn(
    a: Anotacion,
    ctx: {
      existe(pid: string): boolean;
      texto(pid: string): string;
      candidatos(a: Anotacion): string[];
      porHuella?(h: string): string[];
    }
  ): Ubicacion | null;
  huella(texto: string): string;
  /** Secciones ya parseadas → libro.json; de `meta`, lo que falta toma un valor por omisión. */
  armarLibro(
    secciones: Seccion[],
    meta?: {
      titulo?: string;
      subtitulo?: string;
      autor?: string;
      fuentes?: string[];
      generador?: string;
      generado?: string;
    }
  ): Libro;
  /** Los problemas de un libro.json cualquiera (vacío si es válido). */
  validarLibro(libro: unknown): string[];
  /** Un libro de fuera (importado, o de la base) con su HTML reducido a texto, <strong> y <em>. */
  sanearLibro(libro: Libro): Libro;
  libroAMarkdown(libro: Libro): string;
  /** Un ZIP en memoria (EPUB y Word lo son): sus nombres y cómo leer cada entrada; lanza si no es un ZIP. */
  abrirZip(
    bytes: Uint8Array,
    inflar?: OpcionesImportar['inflar']
  ): {
    nombres: string[];
    tiene(nombre: string): boolean;
    bytes(nombre: string): Promise<Uint8Array>;
    texto(nombre: string): Promise<string>;
  };
  decodificarUtf8(bytes: Uint8Array): string;
  importarLibro(
    archivos: { nombre: string; bytes: Uint8Array }[],
    opciones?: OpcionesImportar
  ): Promise<{ libro: Libro; avisos: string[]; origen: string }>;
}

/** Un lector, como lo da la capacidad `user` de claude.ai. */
interface Perfil {
  id: string;
  name: string;
  color?: string;
  avatarUrl?: string;
  email?: string | null;
  isMe?: boolean;
  guest?: boolean;
}
/** La capacidad `user`: quién lee y los perfiles de los demás. */
interface Usuario {
  id(): Promise<string>;
  /** null: no lo sabe (un entorno viejo puede no tenerla). */
  can?(permiso: string): Promise<boolean | null>;
  profiles(ids: string[]): Promise<Record<string, Perfil>>;
}
/** La capacidad `db`: la base compartida. Lo que se lee de ella lo escribió cualquiera: las anotaciones pasan por
 * `problemaDeAnotacion` antes de entrar (90-arranque.js) y los libros por `sanearLibro` y `validarLibro`. */
interface DocumentoBase {
  set(datos: object): Promise<void>;
  update(datos: object): Promise<void>;
  delete(): Promise<void>;
}
interface FotoBase {
  metadata: { fromCache?: boolean; hasPendingWrites?: boolean };
  docChanges(): { type: 'added' | 'modified' | 'removed'; doc: { id: string; data(): Record<string, any> } }[];
}
interface ColeccionBase {
  doc(id: string): DocumentoBase;
  onSnapshot(
    alCambiar: (foto: FotoBase) => void,
    alFallar?: (e: { code?: string; message?: string }) => void
  ): () => void;
}
interface BaseCompartida {
  collection(ruta: string): ColeccionBase;
}
/** La API de claude.ai que la página publicada recibe. */
interface ApiClaude {
  use(nombre: 'db'): Promise<BaseCompartida | null>;
  use(nombre: 'user'): Promise<Usuario | null>;
  use(nombre: string): Promise<any>;
}

interface Window {
  LANucleo: Nucleo;
  claude?: ApiClaude;
  /** El temporizador de la barra de selección. */
  __selT?: number;
}
/** Errores con marcas propias de la biblioteca. */
interface Error {
  sinLibro?: boolean;
  noEsta?: boolean;
  /** El libro ya está en la biblioteca: se pregunta qué hacer. */
  choque?: boolean;
}
/** En Node (pruebas del núcleo) se codifica con Buffer si no hay btoa. */
declare var Buffer: { from(s: string, codificacion: string): { toString(codificacion: string): string } };
