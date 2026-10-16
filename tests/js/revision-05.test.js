// La revisión de la 0.5: la propuesta viaja en la escritura parcial y en la fusión de un borrador.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cargarNucleo } from './nucleo.mjs';

const N = cargarNucleo();
test('sugerencia viaja en el update y en fundirBorrador', () => {
  const S = N.crearSincronia();
  const a = { id: 'x', tipo: 'subrayado', cita: 'uno dos', nota: '', editado: 't0' };
  S.anots.x = a;
  S.enBase.x = 1;
  S.cambiar(Object.assign({}, a, { sugerencia: 'uno tres' }), 't1');
  const e = S.escritura('x');
  assert.equal(e.modo, 'update');
  assert.equal(e.datos.sugerencia, 'uno tres', 'update: ' + JSON.stringify(e.datos));
  const f = N.fundirBorrador(a, Object.assign({}, a, { sugerencia: 'uno tres', editado: 't2' }), S.campos.x);
  assert.equal(f.sugerencia, 'uno tres', 'fundirBorrador: ' + JSON.stringify(f));
});
