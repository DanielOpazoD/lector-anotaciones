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
  alFoto(cambios: { tipo: string; id: string; datos: Anotacion | null }[]): boolean;
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
  pid: string;
  inicio: number;
  fin: number;
  estado: 'exacto' | 'reubicado' | 'perdido';
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
  vecina(
    lista: { id: string }[],
    actual: string | null,
    d: number,
    orden?: { de: (x: any) => number; clave: number | null }
  ): number;
  apilar(
    items: { id: string; y: number | null; h: number }[],
    activo: string | null,
    separacion?: number
  ): { tops: Record<string, number>; alto: number };
  marcarCampos(marcas: Record<string, boolean>, antes: Anotacion, despues: Anotacion): Record<string, boolean>;
  fundirBorrador(deBase: Anotacion, borrador: Anotacion, campos?: Record<string, boolean>): Anotacion;
  igual(a: any, b: any): boolean;
  CAMPOS_LECTOR: string[];
  normalizar(s: string): string;
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
  validarLibro(libro: any): string[];
  sanearLibro(libro: any): any;
  libroAMarkdown(libro: any): string;
  importarLibro(
    archivos: { nombre: string; bytes: Uint8Array }[],
    opciones?: Record<string, any>
  ): Promise<{ libro: any; avisos: string[]; origen: string }>;
}

interface Window {
  LANucleo: Nucleo;
  /** La API de claude.ai que la página publicada recibe (capacidades db, user, downloads). */
  claude?: any;
  __selT?: any;
}
/** Errores con marcas propias de la biblioteca. */
interface Error {
  sinLibro?: boolean;
  noEsta?: boolean;
  choque?: any;
}
/** En Node (pruebas del núcleo) se decodifica con Buffer si no hay TextDecoder. */
declare var Buffer: any;
