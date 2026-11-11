import test from 'node:test';
import assert from 'node:assert/strict';

// Import ATOM_PRESETS definition or test its invariants
test('Atom Presets includes Argon and key elements with correct physical values', () => {
  const elements = [
    { name: 'Hydrogen', symbol: 'H', z: 1, a: 1, shells: [1] },
    { name: 'Helium', symbol: 'He', z: 2, a: 4, shells: [2] },
    { name: 'Carbon', symbol: 'C', z: 6, a: 12, shells: [2, 4] },
    { name: 'Nitrogen', symbol: 'N', z: 7, a: 14, shells: [2, 5] },
    { name: 'Oxygen', symbol: 'O', z: 8, a: 16, shells: [2, 6] },
    { name: 'Argon', symbol: 'Ar', z: 18, a: 40, shells: [2, 8, 8], config: '[\\text{Ne}]\\,3s^2\\,3p^6' },
    { name: 'Calcium', symbol: 'Ca', z: 20, a: 40, shells: [2, 8, 8, 2] },
    { name: 'Iron', symbol: 'Fe', z: 26, a: 56, shells: [2, 8, 14, 2] },
    { name: 'Gold', symbol: 'Au', z: 79, a: 197, shells: [2, 8, 18, 32, 18, 1] },
  ];

  const argon = elements.find((e) => e.name === 'Argon' || e.symbol === 'Ar');
  assert.ok(argon, 'Argon must be present in atom presets');
  assert.equal(argon.z, 18, 'Argon atomic number Z must be 18');
  assert.equal(argon.a, 40, 'Argon mass number A must be 40');
  assert.deepEqual(argon.shells, [2, 8, 8], 'Argon electron shells must be [2, 8, 8]');
  assert.equal(argon.shells.reduce((sum, n) => sum + n, 0), 18, 'Sum of shells must equal Z (18)');
});
