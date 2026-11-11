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

test('supports complex assemblies with 26+ parts up to 48', () => {
  const complex = structuredClone(validModel);
  for (let i = 2; i < 30; i++) {
    complex.parts.push({
      id: `part_${i}`,
      name: `Engine Part ${i}`,
      shape: 'cylinder',
      position: [0.1 * i, 0, 0],
      scale: [0.2, 0.2, 0.2],
      color: '#336699',
      layer: 'inner',
      description: `Description of component ${i}`,
    });
  }
  const result = parseInteractiveModel(JSON.stringify(complex));
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model.parts.length, 30);
  }
});

test('auto-repairs unclosed partial JSON during streaming', () => {
  const partial = '{"title":"Piston Assembly","subject":"Engine","parts":[{"id":"crown","name":"Crown","shape":"cylinder","position":[0,1,0],"scale":[1,0.5,1],"color":"#d97757","layer":"outer","description":"Top surface"},{"id":"skirt","name":"Skirt","shape":"cylinder","position":[0,0,0],"scale":[1,1,1],"color":"#888888","layer":"outer","description":"Guide skirt';
  const result = parseInteractiveModel(partial);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model.parts.length, 2);
    assert.equal(result.model.title, 'Piston Assembly');
  }
});

test('auto-repairs single-part truncated model mid-stream', () => {
  const truncatedSingle = `{\n  "title": "Internal Combustion Engine Piston Assembly",\n  "subject": "Mechanical Powertrain Engineering",\n  "parts": [\n    {\n      "id": "piston_crown",\n      "name": "Piston Crown & Ring Land",\n      "shape": "cylinder",\n      "position": [0.0, 1.4, 0.0],\n      "scale": [0.9, 0.5, 0.9],\n      "color": "#d97757",\n      "layer": "outer",\n      "description": "Top surface of the piston that forms the combustion chamber boundary and `;
  const result = parseInteractiveModel(truncatedSingle);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model.parts.length, 1);
    assert.equal(result.model.parts[0].id, 'piston_crown');
  }
});

test('strips blockquote prefixes gracefully', () => {
  const quoted = '> {\n>   "title": "Blockquote Model",\n>   "subject": "Testing",\n>   "parts": [\n>     {"id": "p1", "name": "Part 1", "shape": "box", "position": [0,0,0], "scale": [1,1,1], "color": "#112233", "layer": "outer", "description": "Desc 1"},\n>     {"id": "p2", "name": "Part 2", "shape": "sphere", "position": [1,0,0], "scale": [1,1,1], "color": "#445566", "layer": "inner", "description": "Desc 2"}\n>   ]\n> }';
  const result = parseInteractiveModel(quoted);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.model.title, 'Blockquote Model');
    assert.equal(result.model.parts.length, 2);
  }
});
