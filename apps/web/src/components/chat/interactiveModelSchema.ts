export type InteractiveModelShape =
  | 'sphere'
  | 'ellipsoid'
  | 'capsule'
  | 'cylinder'
  | 'box'
  | 'torus';

export interface InteractiveModelPart {
  id: string;
  name: string;
  shape: InteractiveModelShape;
  position: [number, number, number];
  scale: [number, number, number];
  color: string;
  layer: string;
  description: string;
  function?: string;
}

export interface InteractiveModel {
  title: string;
  subject: string;
  note?: string;
  parts: InteractiveModelPart[];
}

export type InteractiveModelParseResult =
  | { ok: true; model: InteractiveModel }
  | { ok: false; error: string };

const SHAPES = new Set<InteractiveModelShape>([
  'sphere',
  'ellipsoid',
  'capsule',
  'cylinder',
  'box',
  'torus',
]);

function isVector(value: unknown, positive: boolean): value is [number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 3 &&
    value.every(
      (coordinate) =>
        typeof coordinate === 'number' &&
        Number.isFinite(coordinate) &&
        (positive ? coordinate > 0 && coordinate <= 3 : Math.abs(coordinate) <= 4),
    )
  );
}

export function parseInteractiveModel(code: string): InteractiveModelParseResult {
  let value: unknown;
  try {
    value = JSON.parse(code);
  } catch {
    return { ok: false, error: 'The model data is not valid JSON.' };
  }

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ok: false, error: 'The model must be a JSON object.' };
  }

  const data = value as Record<string, unknown>;
  if (typeof data.title !== 'string' || !data.title.trim()) {
    return { ok: false, error: 'The model needs a title.' };
  }
  if (typeof data.subject !== 'string' || !data.subject.trim()) {
    return { ok: false, error: 'The model needs a subject.' };
  }
  if (!Array.isArray(data.parts) || data.parts.length < 2 || data.parts.length > 24) {
    return { ok: false, error: 'A model must contain between 2 and 24 parts.' };
  }

  const ids = new Set<string>();
  const parts: InteractiveModelPart[] = [];
  for (const [index, rawPart] of data.parts.entries()) {
    if (!rawPart || typeof rawPart !== 'object' || Array.isArray(rawPart)) {
      return { ok: false, error: `Part ${index + 1} must be an object.` };
    }

    const part = rawPart as Record<string, unknown>;
    if (
      typeof part.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,48}$/.test(part.id) ||
      ids.has(part.id)
    ) {
      return { ok: false, error: `Part ${index + 1} needs a unique, valid id.` };
    }
    if (typeof part.name !== 'string' || !part.name.trim() || part.name.length > 80) {
      return { ok: false, error: `Part ${index + 1} needs a short name.` };
    }
    if (typeof part.shape !== 'string' || !SHAPES.has(part.shape as InteractiveModelShape)) {
      return { ok: false, error: `Part "${part.name}" uses an unsupported 3D shape.` };
    }
    if (!isVector(part.position, false) || !isVector(part.scale, true)) {
      return { ok: false, error: `Part "${part.name}" has invalid position or scale values.` };
    }
    if (typeof part.color !== 'string' || !/^#[\da-fA-F]{6}$/.test(part.color)) {
      return { ok: false, error: `Part "${part.name}" needs a six-digit hex color.` };
    }
    if (typeof part.layer !== 'string' || !part.layer.trim() || part.layer.length > 32) {
      return { ok: false, error: `Part "${part.name}" needs a layer name.` };
    }
    if (
      typeof part.description !== 'string' ||
      !part.description.trim() ||
      part.description.length > 500
    ) {
      return { ok: false, error: `Part "${part.name}" needs a concise description.` };
    }
    if (part.function !== undefined && (typeof part.function !== 'string' || part.function.length > 300)) {
      return { ok: false, error: `Part "${part.name}" has an invalid function description.` };
    }

    ids.add(part.id);
    parts.push({
      id: part.id,
      name: part.name.trim(),
      shape: part.shape as InteractiveModelShape,
      position: [...part.position] as [number, number, number],
      scale: [...part.scale] as [number, number, number],
      color: part.color,
      layer: part.layer.trim(),
      description: part.description.trim(),
      ...(typeof part.function === 'string' ? { function: part.function.trim() } : {}),
    });
  }

  return {
    ok: true,
    model: {
      title: data.title.trim().slice(0, 120),
      subject: data.subject.trim().slice(0, 120),
      ...(typeof data.note === 'string' ? { note: data.note.trim().slice(0, 240) } : {}),
      parts,
    },
  };
}
