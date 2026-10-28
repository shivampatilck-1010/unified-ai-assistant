// Conversation persistence via localStorage

import type { Conversation } from '../types';

const STORAGE_KEY = 'unified-ai-conversations';

export function loadConversations(): Conversation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Validate and filter — never crash on malformed data
    return parsed.filter(
      (c): c is Conversation =>
        typeof c === 'object' &&
        c !== null &&
        typeof c.id === 'string' &&
        typeof c.title === 'string' &&
        Array.isArray(c.messages) &&
        typeof c.createdAt === 'number' &&
        typeof c.updatedAt === 'number'
    );
  } catch {
    return [];
  }
}

export function saveConversations(conversations: Conversation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
  } catch {
    // Storage full or unavailable — silently fail
  }
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function createConversation(): Conversation {
  const now = Date.now();
  return {
    id: generateId(),
    title: 'New conversation',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Derive a title from the first user message */
export function deriveTitle(content: string): string {
  const trimmed = content.trim();
  if (trimmed.length <= 50) return trimmed;
  return trimmed.slice(0, 47) + '...';
}
