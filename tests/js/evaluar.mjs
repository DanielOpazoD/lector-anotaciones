// Evalúa funciones del núcleo para las pruebas de paridad de Python: lee de la entrada [[función, [argumentos]], …] y
// escribe la lista de resultados en JSON.
import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();
let entrada = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (entrada += d));
process.stdin.on('end', () => {
  const llamadas = JSON.parse(entrada);
  process.stdout.write(JSON.stringify(llamadas.map(([fn, args]) => N[fn](...args))));
});
