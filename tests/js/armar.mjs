// Arma un libro.json con el núcleo de la página (sin navegador), para compararlo con el del paquete Python:
//   node tests/js/armar.mjs [--titulo T] fuente.md … > libro.json
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();
const args = process.argv.slice(2);
let titulo = '';
const i = args.indexOf('--titulo');
if (i >= 0) {
  titulo = args[i + 1];
  args.splice(i, 2);
}
const archivos = args.map((r) => ({ nombre: path.basename(r), texto: readFileSync(r, 'utf8') }));
const libro = N.armarLibro(N.parsearMarkdown(archivos, 'figs/'), { titulo, fuentes: archivos.map((a) => a.nombre) });
process.stdout.write(JSON.stringify(libro));
