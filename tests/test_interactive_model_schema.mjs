import assert from 'node:assert/strict';
import test from 'node:test';
import { parseInteractiveModel } from '../apps/web/src/components/chat/interactiveModelSchema.ts';

const validModel = {
  title: 'Cell cross-section',
  subject: 'An educational cell model',
  parts: [
    {
      id: 'membrane',
      name: 'Cell membrane',
      shape: 'ellipsoid',
      position: [0, 0, 0],
      scale: [1.5, 1, 1],
      color: '#55AA88',
      layer: 'outer',
      description: 'A boundary around the cell.',
      function: 'Controls movement into and out of the cell.',
    },
    {
      id: 'nucleus',
      name: 'Nucleus',
      shape: 'sphere',
      position: [0.2, 0.1, 0],
      scale: [0.4, 0.4, 0.4],
      color: '#9977CC',
      layer: 'inner',
      description: 'Contains most of the cell DNA.',
    },
  ],
};

test('parses a valid interactive model', () => {
  const result = parseInteractiveModel(JSON.stringify(validModel));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model.parts.length, 2);
    assert.equal(result.model.parts[0].layer, 'outer');
  }
});

test('rejects invalid JSON and unsupported geometry', () => {
  assert.equal(parseInteractiveModel('{').ok, false);
  const invalid = structuredClone(validModel);
  invalid.parts[0].shape = 'script';
  const result = parseInteractiveModel(JSON.stringify(invalid));
  assert.equal(result.ok, false);
  if (!result.ok) assert.match(result.error, /unsupported 3D shape/i);
});

test('rejects out-of-range coordinates and duplicate ids', () => {
  const badPosition = structuredClone(validModel);
  badPosition.parts[0].position[0] = 100;
  assert.equal(parseInteractiveModel(JSON.stringify(badPosition)).ok, false);

  const duplicateIds = structuredClone(validModel);
  duplicateIds.parts[1].id = duplicateIds.parts[0].id;
  assert.equal(parseInteractiveModel(JSON.stringify(duplicateIds)).ok, false);
});
