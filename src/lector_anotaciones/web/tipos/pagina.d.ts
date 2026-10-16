// Generado por herramientas/modulos.mjs a partir de pagina/*.js: no se edita a mano (npm run modulos).

/** Lo que cada fragmento de la página ofrece a los demás (LAPagina, `P` dentro de cada módulo). */
interface Pagina {
  // 00-base.js
  libro: () => Libro;
  fallo: (donde?: string, e?: any) => void;
  SEC_BY_ID: Record<string, Seccion>;
  BLOQUE_SEC: Record<string, string>;
  POS_BLOQUE: Record<string, number>;
  ORIG: Record<string, string>;
  BLOQUES: Record<string, Bloque>;
  PERFILES: Record<string, Perfil>;
  PERFILES_PEDIDOS: Record<string, number>;
  RESPALDO_MAX: number;
  N: Nucleo;
  SINC: Sincronia;
  anots: Record<string, Anotacion>;
  VISTA: Vista;
  V: EstadoVista;
  $: (s?: any, r?: any) => any;
  $$: (s?: any, r?: any) => any[];
  el: (tag?: any, attrs?: any, kids?: any) => any;
  ahora: () => string;
  FALLOS: { cuando: string; donde: string; error: string }[];
  uid: () => string;
  estado: (t?: any, aviso?: any) => void;
  anunciar: (t?: any) => void;
  lsGet: (k?: any) => string | null;
  lsSet: (k?: any, v?: any) => boolean;
  enCurso: (p?: any) => any;
  bytesJSON: (v?: any) => number;
  // 10-libro.js
  renderLibro: () => void;
  irA: (sid?: any, pid?: any) => void;
  mover: (d?: any) => void;
  // 20-guardado.js
  guardar: (a?: any) => void;
  guardarSilencioso: (id?: any, parche?: any) => void;
  escribirEnBase: (id?: any, previa?: any, alRechazar?: any, reintento?: any) => void;
  reintentar: (id?: any) => void;
  activarSoloLectura: () => void;
  borrar: (id?: any) => void;
  escribirCampos: (ids?: any) => void;
  guardarLocal: (ids?: any) => void;
  podarLocal: (ids?: any) => void;
  cargarLocal: (filtro?: any) => { migradas: number; guardadas: boolean; nuevas: any; existentes: any };
  // 30-crear.js
  notaPagina: (pg?: any, sid?: any) => void;
  notaSeccion: () => void;
  notaGeneral: () => void;
  extremosDeRango: (r?: any) => { paras: any; pA: any; pB: any; aFuera: boolean; bFuera: boolean };
  crearSubrayado: (color?: any, conNota?: any, proponer?: any) => void;
  ancestroPid: (n?: any) => any;
  // 40-ubicar.js
  textoPlano: (pid?: any) => any;
  ubicar: (a?: any) => Ubicacion | null;
  reubicarTodo: () => void;
  pidEfectivo: (a?: any) => any;
  // 45-pintar.js
  pintar: (a?: any) => void;
  pintarPid: (pid?: any) => void;
  esMarcador: (c?: any) => boolean;
  refrescarMarcas: () => void;
  pintarTodo: () => void;
  marcasPagina: () => void;
  // 50-panel.js
  cambiarTab: (t?: any) => void;
  porRevisar: (a?: any) => boolean;
  cuantasPorRevisar: () => number;
  lista: (todoElLibro?: any) => any[];
  listaNavegable: () => any[];
  ordenKey: (a?: any) => number;
  vistaEnSitio: (id?: any, cambios?: any) => void;
  propuestaAbierta: (id?: any) => void;
  olvidarFicha: (id?: any) => void;
  avanzarFicha: (id?: any, ant?: any) => void;
  renderPanel: () => void;
  renderCuentaRevisar: () => void;
  etiqueta: (a?: any) => string;
  ajustarAlto: (ta?: any) => void;
  ajustarTextareas: (raiz?: any) => void;
  activar: (id?: any) => void;
  // 52-ficha.js
  ficha: (a?: any, v?: any) => any;
  abrirPropuesta: (id?: any) => void;
  // 54-revisar.js
  cambioDe: (a?: any) => any;
  verCambio: (id?: any) => void;
  revisar: (id?: any, accion?: any) => void;
  navegar: (d?: any) => void;
  actualizarNav: () => void;
  irAAnot: (a?: any, mostrar?: any) => void;
  enfocar: (id?: any, editar?: any, mostrar?: any) => void;
  renderCuentas: () => void;
  // 55-margen.js
  margenActivo: () => any;
  colocarMargen: () => void;
  soltarMargen: () => void;
  colocarMargenPronto: () => void;
  reacomodarPorActivar: (id?: any) => void;
  asegurarVisibleMargen: (id?: any) => void;
  // 60-exportar.js
  textoAnotacion: (a?: any) => string;
  copiarSeleccion: (boton?: any) => void;
  exportarJSON: () => string;
  exportarMD: () => string;
  diagnostico: () => string;
  copiar: (txt?: any, boton?: any) => void;
  // 65-buscar.js
  buscar: (q?: any) => void;
  // 70-interfaz.js
  ocultarTb: () => void;
  marcarFiltro: () => void;
  quitarFiltros: () => void;
  enfocable: (n?: any) => boolean;
  cerrarHerramientas: () => void;
  lateral: (cual?: any, abierto?: any, origen?: any) => void;
  volverAlTexto: (id?: any) => void;
  abrirDialogo: (d?: any) => void;
  cerrarDialogo: (d?: any) => void;
  alternarFoco: () => void;
  mqMovil: MediaQueryList;
  // 75-lectores.js
  chipAutor: (perfil?: any, yo?: any) => any;
  variosAutores: () => boolean;
  resolverPerfiles: (ids?: any) => void;
  etiquetasFicha: (a?: any) => any;
  pintarEtiquetas: (f?: any, a?: any) => void;
  renderSelectores: () => void;
  etiquetasDe: (a?: Anotacion) => string[];
  // 80-cambios.js
  registrarVisto: (sid?: any) => void;
  marcarCambio: (b?: any, node?: any) => void;
  alternarDiff: (pid?: any, abrir?: any) => void;
  lsJSON: (k?: any) => any;
  diffPalabras: (antes?: string, ahora?: string) => ['=' | '-' | '+', string][];
  // 82-capas.js
  renderCapasMenu: () => void;
  // 84-progreso-voz.js
  herramientasSeccion: (s?: any) => any;
  alternarLeida: (sid?: any) => void;
  renderProgreso: () => void;
  detenerLectura: () => void;
  // 86-deshacer-respaldo.js
  retirarDeshacer: (id?: any, soloCambios?: any) => void;
  ofrecerDeshacer: (a?: any, campos?: any) => void;
  ofrecerDeshacerCambio: (id?: any, antes?: any, despues?: any, texto?: any) => void;
  respaldar: () => void;
  // 88-biblioteca.js
  claveLocalDe: (tipo?: any, id?: any) => string;
  obtenerLibro: () => any;
  rutaBase: (nombre?: any) => any;
  mostrarSinLibro: (motivo?: any) => void;
  usoDb: Promise<BaseCompartida | null>;
  usoUser: Promise<Usuario | null>;
}

/** El estado que los fragmentos comparten y reasignan (LAEstado, `E` dentro de cada módulo). */
interface Estado {
  // 00-base.js
  LIBRO: Libro | null;
  SECS: Seccion[];
  db: BaseCompartida | null;
  col: ColeccionBase | null;
  modo: 'cargando' | 'local' | 'db';
  LOCAL_KEY: string;
  USER: Usuario | null;
  ME: string | null;
  CAPAS_ON: Record<string, boolean>;
  VISTO: Record<string, string>;
  LEIDAS: Record<string, boolean>;
  ultimoBorrado: Anotacion | null;
  lectura: { sid: any; boton: any; i: number } | null;
  SOLO_LECTURA: false | true;
  respaldoHoy: string | null;
  respaldoBloqueado: false | true;
  avisoRevisar: false | true;
  ESCRIBIENDO: 0;
  // 40-ubicar.js
  UBIC: Record<string, Ubicacion>;
  // 55-margen.js
  punteroAbajo: false | true;
  // 70-interfaz.js
  volverA: Element | null;
  // 88-biblioteca.js
  FUENTE: { tipo: 'base' | 'pagina' | 'local'; id: string | null };
}

declare var LAPagina: Pagina;
declare var LAEstado: Estado;
