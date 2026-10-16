// Carga los módulos del núcleo como lo hace la página: en orden, sobre un mismo espacio de nombres (LANucleo). Cada
// archivo corre con su nombre (vm), así que la cobertura de `node --test --experimental-test-coverage` lo ve tal cual,
// con sus mismas líneas.
import { readFileSync, readdirSync } from 'node:fs';
import vm from 'node:vm';
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
    const ruta = path.join(NUCLEO, nombre);
    vm.runInThisContext('(function (self) {' + readFileSync(ruta, 'utf8') + '\n})', { filename: ruta })(raiz);
  }
  return raiz.LANucleo;
}
