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
  gltf_url?: string;
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
        (positive ? coordinate > 0 && coordinate <= 3.5 : Math.abs(coordinate) <= 4),
    )
  );
}

function tryParseOrRepairJson(raw: string): unknown {
  const trimmed = raw.trim();
  try {
    return JSON.parse(trimmed);
  } catch {}

  // Strip leading markdown blockquote markers (e.g. `> {`) if model generated inside blockquote
  let cleaned = trimmed.replace(/^[ \t]*>[ \t]?/gm, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Strip trailing markdown code fences if present
  cleaned = cleaned.replace(/```+$/, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {}

  // Attempt auto-repair of partial/streaming JSON
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (let i = 0; i < cleaned.length; i++) {
    const char = cleaned[i];
    if (char === '\\' && inString) {
      escaped = !escaped;
      continue;
    }
    if (char === '"' && !escaped) {
      inString = !inString;
    } else if (!inString) {
      if (char === '{' || char === '[') {
        stack.push(char);
      } else if (char === '}' || char === ']') {
        stack.pop();
      }
    }
    escaped = false;
  }

  if (inString) {
    cleaned += '"';
  }

  // Remove trailing dangling commas, incomplete keys, or dangling colons before closing
  cleaned = cleaned.replace(/,\s*$/, '');
  cleaned = cleaned.replace(/,\s*"[^"]*"\s*:\s*$/, '');
  cleaned = cleaned.replace(/:\s*$/, ': null');

  // Close any open brackets and braces
  while (stack.length > 0) {
    const open = stack.pop();
    if (open === '{') cleaned += '}';
    else if (open === '[') cleaned += ']';
  }

  try {
    return JSON.parse(cleaned);
  } catch {}

  return null;
}

export function parseInteractiveModel(code: string): InteractiveModelParseResult {
  const value = tryParseOrRepairJson(code);
  if (!value) {
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
  if (!Array.isArray(data.parts) || data.parts.length < 1) {
    return { ok: false, error: 'A model must contain at least 1 part.' };
  }

  // Gracefully clamp to a maximum of 48 parts to support complex assemblies without breaking
  const rawPartsList = data.parts.slice(0, 48);

  const ids = new Set<string>();
  const parts: InteractiveModelPart[] = [];
  for (const [index, rawPart] of rawPartsList.entries()) {
    const isLastItem = index === rawPartsList.length - 1;

    if (!rawPart || typeof rawPart !== 'object' || Array.isArray(rawPart)) {
      if (isLastItem && parts.length >= 1) break;
      return { ok: false, error: `Part ${index + 1} must be an object.` };
    }

    const part = rawPart as Record<string, unknown>;

    // Duplicate IDs are always rejected
    if (typeof part.id === 'string' && ids.has(part.id)) {
      return { ok: false, error: `Part ${index + 1} needs a unique, valid id.` };
    }

    if (
      typeof part.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,48}$/.test(part.id)
    ) {
      if (isLastItem && parts.length >= 1) break;
      return { ok: false, error: `Part ${index + 1} needs a unique, valid id.` };
    }

    if (typeof part.name !== 'string' || !part.name.trim() || part.name.length > 80) {
      if (isLastItem && parts.length >= 1) break;
      return { ok: false, error: `Part ${index + 1} needs a short name.` };
    }

    if (typeof part.shape !== 'string' || !SHAPES.has(part.shape as InteractiveModelShape)) {
      return { ok: false, error: `Part "${part.name}" uses an unsupported 3D shape.` };
    }

    if (!isVector(part.position, false) || !isVector(part.scale, true)) {
      return { ok: false, error: `Part "${part.name}" has invalid position or scale values.` };
    }

    if (typeof part.color !== 'string' || !/^#[\da-fA-F]{6}$/.test(part.color)) {
      if (isLastItem && parts.length >= 1) break;
      return { ok: false, error: `Part "${part.name}" needs a six-digit hex color.` };
    }

    if (typeof part.layer !== 'string' || !part.layer.trim() || part.layer.length > 32) {
      if (isLastItem && parts.length >= 1) break;
      return { ok: false, error: `Part "${part.name}" needs a layer name.` };
    }

    if (
      typeof part.description !== 'string' ||
      !part.description.trim() ||
      part.description.length > 500
    ) {
      if (isLastItem && parts.length >= 1) break;
      return { ok: false, error: `Part "${part.name}" needs a concise description.` };
    }

    if (part.function !== undefined && (typeof part.function !== 'string' || part.function.length > 300)) {
      if (isLastItem && parts.length >= 1) break;
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

  if (parts.length < 1) {
    return { ok: false, error: 'A model must contain at least 1 valid part.' };
  }

  return {
    ok: true,
    model: {
      title: data.title.trim().slice(0, 120),
      subject: data.subject.trim().slice(0, 120),
      ...(typeof data.note === 'string' ? { note: data.note.trim().slice(0, 240) } : {}),
      ...(typeof data.gltf_url === 'string' && data.gltf_url.startsWith('http') ? { gltf_url: data.gltf_url.trim() } : {}),
      parts,
    },
  };
}
