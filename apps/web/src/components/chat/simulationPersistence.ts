/**
 * simulationPersistence.ts
 * Manages client-side persistent state for interactive STEM & algorithmic simulations.
 * Preserves user modifications (arrays, trees, graphs, linked lists, parameters) across sessions.
 */

const STORAGE_PREFIX = 'unified_ai_sim_state_v1_';

export function loadSimulationState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed !== null && parsed !== undefined ? (parsed as T) : fallback;
  } catch (err) {
    console.warn(`[simulationPersistence] Failed to load state for "${key}":`, err);
    return fallback;
  }
}

export function saveSimulationState<T>(key: string, data: T): void {
  try {
    localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(data));
  } catch (err) {
    console.warn(`[simulationPersistence] Failed to save state for "${key}":`, err);
  }
}

export function clearSimulationState(key: string): void {
  try {
    localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
  } catch (err) {
    console.warn(`[simulationPersistence] Failed to clear state for "${key}":`, err);
  }
}
