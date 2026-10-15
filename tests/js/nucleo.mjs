// Carga los módulos del núcleo como lo hace la página: en orden, sobre un mismo espacio de nombres (LANucleo).
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const NUCLEO = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'src',
  'lector_anotaciones',
  'web',
  'nucleo'
);

export function cargarNucleo() {
  const raiz = {};
  for (const nombre of readdirSync(NUCLEO)
    .filter((n) => n.endsWith('.js'))
    .sort()) {
    new Function('self', readFileSync(path.join(NUCLEO, nombre), 'utf8'))(raiz);
  }
  return raiz.LANucleo;
}
