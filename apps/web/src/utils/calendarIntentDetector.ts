import type { CalendarReminderData } from '../components/calendar/CalendarReminderCard';

/**
 * Intelligent client-side parser to detect user intent to schedule, remind, or create tasks.
 */
export function detectCalendarIntent(text: string): CalendarReminderData | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  // Trigger keywords check
  const triggerPatterns = [
    /\bremind\s+(?:me\s+)?(?:to\s+)?/i,
    /\bset\s+(?:a\s+)?reminder\b/i,
    /\bschedule\b/i,
    /\badd\s+(?:a\s+)?task\b/i,
    /\bcreate\s+(?:a\s+)?task\b/i,
    /\bput\s+(?:it\s+)?on\s+(?:my\s+)?calendar\b/i,
    /\bcalendar\s+event\b/i,
    /\bmeeting\s+(?:on|at|with)\b/i,
    /\bdue\s+(?:on|by|date)\b/i,
  ];

  const hasTrigger = triggerPatterns.some((pattern) => pattern.test(lower));
  if (!hasTrigger) return null;

  // Determine item type
  let type: 'reminder' | 'task' | 'event' = 'reminder';
  if (/\btask\b/i.test(lower) || /\btodo\b/i.test(lower)) {
    type = 'task';
  } else if (/\bmeeting\b/i.test(lower) || /\bevent\b/i.test(lower) || /\bschedule\b/i.test(lower)) {
    type = 'event';
  }

  // Determine target date
  const now = new Date();
  let targetDate = new Date(now);

  const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  let matchedDayOffset: number | null = null;

  if (/\btomorrow\b/i.test(lower)) {
    targetDate.setDate(now.getDate() + 1);
  } else if (/\bday\s+after\s+tomorrow\b/i.test(lower)) {
    targetDate.setDate(now.getDate() + 2);
  } else if (/\btoday\b/i.test(lower) || /\btonight\b/i.test(lower)) {
    // Keep today
  } else {
    for (let i = 0; i < daysOfWeek.length; i++) {
      const dayName = daysOfWeek[i];
      const dayRegex = new RegExp(`\\b(?:on\\s+|next\\s+)?${dayName}\\b`, 'i');
      if (dayRegex.test(lower)) {
        const currentDayIndex = now.getDay();
        let diff = (i - currentDayIndex + 7) % 7;
        if (diff === 0) diff = 7; // Next occurrence
        matchedDayOffset = diff;
        targetDate.setDate(now.getDate() + diff);
        break;
      }
    }
  }

  // Look for specific date like "Nov 10", "15th November", "2026-11-05"
  const isoDateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoDateMatch) {
    const parsed = new Date(isoDateMatch[0]);
    if (!isNaN(parsed.getTime())) targetDate = parsed;
  }

  // Determine time (e.g. "10:00 AM", "5pm", "16:30")
  let targetTime = '09:00';
  const timeMatch = text.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (timeMatch) {
    let hour = parseInt(timeMatch[1], 10);
    const minute = timeMatch[2] ? parseInt(timeMatch[2], 10) : 0;
    const meridian = timeMatch[3].toLowerCase();
    if (meridian === 'pm' && hour < 12) hour += 12;
    if (meridian === 'am' && hour === 12) hour = 0;
    targetTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
  } else {
    const militaryMatch = text.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (militaryMatch) {
      targetTime = `${militaryMatch[1].padStart(2, '0')}:${militaryMatch[2]}`;
    }
  }

  // Clean title
  let cleanedTitle = text
    .replace(/^(?:please\s+)?(?:can\s+you\s+)?(?:remind\s+me\s+to\s+|remind\s+me\s+|set\s+a\s+reminder\s+(?:to\s+|for\s+)?|schedule\s+(?:a\s+)?(?:meeting\s+with\s+|event\s+for\s+)?|add\s+(?:a\s+)?task\s+(?:to\s+|for\s+)?)/i, '')
    .replace(/\b(?:tomorrow|today|day\s+after\s+tomorrow|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .trim();

  // Capitalize first letter
  if (cleanedTitle.length > 0) {
    cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
  } else {
    cleanedTitle = type === 'task' ? 'New Task' : 'Reminder';
  }

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');

  return {
    title: cleanedTitle.slice(0, 80),
    date: `${yyyy}-${mm}-${dd}`,
    time: targetTime,
    type,
    description: `Created from Unified AI chat: "${text.slice(0, 120)}"`,
  };
}
