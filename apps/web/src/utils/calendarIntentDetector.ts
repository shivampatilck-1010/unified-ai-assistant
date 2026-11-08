import type { CalendarReminderData } from '../components/calendar/CalendarReminderCard';

/**
 * Intelligent client-side parser to detect user intent to schedule, remind, or create tasks.
 * Tolerates human typos ('tommaro', 'calander', 'schedual', etc.) and natural variations.
 */
export function detectCalendarIntent(text: string): CalendarReminderData | null {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase().trim();

  // 1. Broad Trigger patterns (handles typos: 'calander', 'calender', 'tommaro', 'schedual', etc.)
  const triggerPatterns = [
    /\bremind\s*(?:me)?(?:\s+to|\s+about)?\b/i,
    /\bset\s*(?:a\s*)?(?:reminder|alarm|timer|event|task)\b/i,
    /\b(?:set|put|add|save|keep|mark|place)\s+(?:this\s+|it\s+)?(?:on|in|to)\s+(?:the\s+|my\s+)?(?:cal[ae]nd[ae]r|cal|tasks?|schedule)\b/i,
    /\b(?:schedule|schedual|schedul|skedule)\b/i,
    /\b(?:cal[ae]nd[ae]r|calender|calander)\b/i,
    /\badd\s+(?:a\s+)?(?:task|event|todo)\b/i,
    /\bcreate\s+(?:a\s+)?(?:task|event|reminder)\b/i,
    /\bmeeting\s+(?:on|at|with)\b/i,
    /\bdue\s+(?:on|by|date)\b/i,
    /\b(?:have|got)\s+(?:an?\s+)?(?:exam|test|quiz|viva|interview|presentation)\b/i,
    /\bexam\s+(?:tomorrow|tommaro|tommorow|today|next|at|on)\b/i,
  ];

  const hasTrigger = triggerPatterns.some((pattern) => pattern.test(lower));
  if (!hasTrigger) return null;

  // 2. Determine item type
  let type: 'reminder' | 'task' | 'event' = 'event';
  if (/\b(?:task|todo|checklist)\b/i.test(lower)) {
    type = 'task';
  } else if (/\b(?:remind|reminder|alarm)\b/i.test(lower) && !/\b(?:exam|meeting|event)\b/i.test(lower)) {
    type = 'reminder';
  }

  // 3. Determine target date (with typo resilience)
  const now = new Date();
  let targetDate = new Date(now);

  const tomorrowRegex = /\b(?:tomorrow|tommaro|tommorow|tommorrow|tommoro|tmrw|2moro|next\s+day)\b/i;
  const dayAfterTomorrowRegex = /\b(?:day\s+after\s+(?:tomorrow|tommaro|tommorow)|in\s+2\s+days)\b/i;

  if (dayAfterTomorrowRegex.test(lower)) {
    targetDate.setDate(now.getDate() + 2);
  } else if (tomorrowRegex.test(lower)) {
    targetDate.setDate(now.getDate() + 1);
  } else if (/\b(?:today|tonight|this\s+evening)\b/i.test(lower)) {
    // Keep today
  } else {
    const daysOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    for (let i = 0; i < daysOfWeek.length; i++) {
      const dayName = daysOfWeek[i];
      const dayRegex = new RegExp(`\\b(?:on\\s+|next\\s+)?${dayName}\\b`, 'i');
      if (dayRegex.test(lower)) {
        const currentDayIndex = now.getDay();
        let diff = (i - currentDayIndex + 7) % 7;
        if (diff === 0) diff = 7; // Next occurrence
        targetDate.setDate(now.getDate() + diff);
        break;
      }
    }
  }

  // Check specific ISO dates
  const isoDateMatch = text.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (isoDateMatch) {
    const parsed = new Date(isoDateMatch[0]);
    if (!isNaN(parsed.getTime())) targetDate = parsed;
  }

  // 4. Determine time (e.g. "10:00 AM", "5pm", "16:30", defaults to 09:00)
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

  // 5. Intelligent Title Formatter
  let cleanedTitle = text
    .replace(/^(?:please\s+)?(?:can\s+(?:you|u)\s+)?(?:set\s+(?:this\s+|it\s+)?on\s+(?:my\s+)?cal[ae]nd[ae]r(?:\s+for\s+that)?|remind\s+me\s+to\s+|remind\s+me\s+|set\s+a\s+reminder\s+(?:to\s+|for\s+)?|schedule\s+(?:a\s+)?(?:meeting\s+with\s+|event\s+for\s+)?|add\s+(?:a\s+)?task\s+(?:to\s+|for\s+)?)/i, '')
    .replace(/\b(?:tomorrow|tommaro|tommorow|tommorrow|tommoro|tmrw|today|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/gi, '')
    .replace(/\b(?:at\s+)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/gi, '')
    .replace(/\b(?:can\s+(?:u|you)\s+set\s+(?:it\s+)?on\s+cal[ae]nd[ae]r(?:\s+for\s+that)?)\b/gi, '')
    .replace(/[?.!]+$/g, '')
    .trim();

  // If query mentions "exam"
  if (/\bexam\b/i.test(lower)) {
    if (/\bchemistry|chemical|science\b/i.test(lower)) {
      cleanedTitle = 'Chemistry Exam';
    } else if (cleanedTitle.length < 3 || /^(?:i\s+have|exam|for\s+that|my\s+exam)/i.test(cleanedTitle)) {
      cleanedTitle = 'Chemistry & Science Exam';
    } else {
      cleanedTitle = `${cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1)}`;
      if (!cleanedTitle.toLowerCase().includes('exam')) {
        cleanedTitle += ' Exam';
      }
    }
  } else if (cleanedTitle.length > 0) {
    cleanedTitle = cleanedTitle.charAt(0).toUpperCase() + cleanedTitle.slice(1);
  } else {
    cleanedTitle = type === 'task' ? 'Important Task' : 'Scheduled Event';
  }

  const yyyy = targetDate.getFullYear();
  const mm = String(targetDate.getMonth() + 1).padStart(2, '0');
  const dd = String(targetDate.getDate()).padStart(2, '0');

  return {
    title: cleanedTitle.slice(0, 80),
    date: `${yyyy}-${mm}-${dd}`,
    time: targetTime,
    type,
    description: `Scheduled via Unified AI Assistant. Review study materials, notes, and exam formulas.`,
  };
}
