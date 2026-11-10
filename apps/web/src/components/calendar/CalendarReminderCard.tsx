import React, { useState, useEffect } from 'react';
import { createCalendarEvent, createTask, getUserStoragePrefix } from '../../lib/api';
import './CalendarReminderCard.css';

export interface CalendarReminderData {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  type: 'reminder' | 'task' | 'event';
  description?: string;
  location?: string;
}

interface CalendarReminderCardProps {
  isOpen: boolean;
  onClose: () => void;
  initialData: CalendarReminderData | null;
  onSuccess?: (savedItem: any) => void;
}

export function CalendarReminderCard({
  isOpen,
  onClose,
  initialData,
  onSuccess,
}: CalendarReminderCardProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('09:00');
  const [type, setType] = useState<'reminder' | 'task' | 'event'>('reminder');
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) {
      setTitle(initialData.title || '');
      setDate(initialData.date || new Date().toISOString().split('T')[0]);
      setTime(initialData.time || '09:00');
      setType(initialData.type || 'reminder');
      setDescription(initialData.description || '');
      setSuccessMsg(null);
    }
  }, [initialData]);

  if (!isOpen || !initialData) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date) return;

    setIsSubmitting(true);
    setSuccessMsg(null);

    try {
      const [year, month, day] = date.split('-').map(Number);
      const [hours, minutes] = (time || '09:00').split(':').map(Number);
      const startDateTime = new Date(year, month - 1, day, hours, minutes);
      const endDateTime = new Date(startDateTime.getTime() + 60 * 60 * 1000);

      let saved: any = null;

      if (type === 'task') {
        saved = await createTask({
          title: title.trim(),
          description: description.trim() || null,
          priority: 'medium',
          due_date: startDateTime.toISOString(),
        });
      } else {
        // Event or Reminder
        saved = await createCalendarEvent({
          title: title.trim(),
          description: description.trim() || null,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          all_day: false,
          color: type === 'reminder' ? 'orange' : 'blue',
        });
      }

      // Also persist to user-scoped localStorage for instant offline/reload retention
      try {
        const prefix = getUserStoragePrefix();
        const localKey = type === 'task' ? `${prefix}tasks_v1` : `${prefix}calendar_events_v1`;
        const existingRaw = localStorage.getItem(localKey);
        const list = existingRaw ? JSON.parse(existingRaw) : [];
        list.unshift(saved || {
          id: `item-${Date.now()}`,
          title: title.trim(),
          description,
          start_time: startDateTime.toISOString(),
          end_time: endDateTime.toISOString(),
          created_at: new Date().toISOString(),
          type,
        });
        localStorage.setItem(localKey, JSON.stringify(list));
        window.dispatchEvent(new CustomEvent('calendar-updated'));
      } catch (err) {
        console.warn('LocalStorage save error:', err);
      }

      setSuccessMsg(
        type === 'task'
          ? '✓ Task added to Calendar & Tasks!'
          : '✓ Event scheduled on Calendar!'
      );

      if (onSuccess) {
        onSuccess(saved);
      }

      setTimeout(() => {
        onClose();
      }, 1300);
    } catch (err) {
      console.error('Failed to create calendar/task item:', err);
      // Fallback: save to user-scoped localStorage anyway
      try {
        const prefix = getUserStoragePrefix();
        const localKey = type === 'task' ? `${prefix}tasks_v1` : `${prefix}calendar_events_v1`;
        const existingRaw = localStorage.getItem(localKey);
        const list = existingRaw ? JSON.parse(existingRaw) : [];
        list.unshift({
          id: `local-${Date.now()}`,
          title: title.trim(),
          description,
          due_date: `${date}T${time}:00`,
          start_time: `${date}T${time}:00`,
          type,
        });
        localStorage.setItem(localKey, JSON.stringify(list));
        setSuccessMsg('✓ Saved to your local Calendar & Tasks!');
        setTimeout(() => onClose(), 1300);
      } catch {
        onClose();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="calendar-card-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="calendar-card-modal" onClick={(e) => e.stopPropagation()}>
        <div className="calendar-card-header">
          <div className="calendar-card-header-badge">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true">
              <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.6" />
              <path d="M2 7h14M6 1v4M12 1v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
            <span>Smart Calendar & Task Detected</span>
          </div>
          <button
            type="button"
            className="calendar-card-close-btn"
            onClick={onClose}
            aria-label="Close schedule card"
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="calendar-card-form">
          <div className="calendar-card-type-toggle">
            <button
              type="button"
              className={`calendar-type-pill ${type === 'reminder' ? 'active' : ''}`}
              onClick={() => setType('reminder')}
            >
              🔔 Reminder
            </button>
            <button
              type="button"
              className={`calendar-type-pill ${type === 'task' ? 'active' : ''}`}
              onClick={() => setType('task')}
            >
              ✓ Task
            </button>
            <button
              type="button"
              className={`calendar-type-pill ${type === 'event' ? 'active' : ''}`}
              onClick={() => setType('event')}
            >
              📅 Event
            </button>
          </div>

          <div className="calendar-card-field">
            <label htmlFor="calendar-item-title">Title</label>
            <input
              id="calendar-item-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Submit chemistry assignment"
              required
              autoFocus
            />
          </div>

          <div className="calendar-card-row">
            <div className="calendar-card-field">
              <label htmlFor="calendar-item-date">Date</label>
              <input
                id="calendar-item-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </div>
            <div className="calendar-card-field">
              <label htmlFor="calendar-item-time">Time</label>
              <input
                id="calendar-item-time"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </div>

          <div className="calendar-card-field">
            <label htmlFor="calendar-item-notes">Notes (optional)</label>
            <textarea
              id="calendar-item-notes"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details, agenda, or location…"
              rows={2}
            />
          </div>

          {successMsg && (
            <div className="calendar-card-success">
              {successMsg}
            </div>
          )}

          <div className="calendar-card-actions">
            <button
              type="button"
              className="calendar-card-cancel-btn"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="calendar-card-submit-btn"
              disabled={isSubmitting || !title.trim() || !date}
            >
              {isSubmitting ? 'Saving…' : '✓ Confirm & Set on Calendar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
