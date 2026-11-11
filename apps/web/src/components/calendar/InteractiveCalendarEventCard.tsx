import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createCalendarEvent, createTask, getUserStoragePrefix } from '../../lib/api';
import './InteractiveCalendarEventCard.css';

export interface CalendarEventDetails {
  title: string;
  date: string; // YYYY-MM-DD
  time?: string; // HH:MM
  endTime?: string; // HH:MM
  type?: 'event' | 'task' | 'reminder';
  priority?: 'high' | 'medium' | 'low';
  description?: string;
  location?: string;
}

interface InteractiveCalendarEventCardProps {
  event: CalendarEventDetails;
  onNavigateToCalendar?: () => void;
}

const COMMON_SUBJECTS = [
  'Chemistry',
  'Physics',
  'Mathematics',
  'Biology',
  'Computer Science',
  'Engineering',
];

const QUICK_TIME_SLOTS = [
  { label: 'Morning (09:00 AM)', start: '09:00', end: '12:00' },
  { label: 'Afternoon (01:30 PM)', start: '13:30', end: '16:30' },
  { label: 'Evening (05:00 PM)', start: '17:00', end: '20:00' },
];

export const InteractiveCalendarEventCard: React.FC<InteractiveCalendarEventCardProps> = ({
  event,
  onNavigateToCalendar,
}) => {
  // Tomorrow's default ISO date
  const tomorrowIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  // Detected User Timezone
  const userTimeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  // Editable Event State
  const [title, setTitle] = useState(event.title || 'Chemistry Exam');
  const [date, setDate] = useState(
    event.date && event.date.includes('-') && !event.date.toLowerCase().includes('tomorrow')
      ? event.date
      : tomorrowIso
  );
  const [startTime, setStartTime] = useState(event.time || '09:00');
  const [endTime, setEndTime] = useState(event.endTime || '12:00');
  const [notes, setNotes] = useState(
    event.description ||
      'Review key reaction kinetics, formulas, potential energy curves, and cheat sheets.'
  );
  const location = event.location || 'University Exam Center';
  const [selectedSubject, setSelectedSubject] = useState<string>('Chemistry');

  const [isSavedToUnified, setIsSavedToUnified] = useState(false);
  const [isSavedAsTask, setIsSavedAsTask] = useState(false);
  const [isEditingNotes, setIsEditingNotes] = useState(false);

  // Formatted human readable date
  const { monthName, dayNum, dayName, formattedDateString } = useMemo(() => {
    try {
      const [y, m, d] = date.split('-').map(Number);
      const dt = new Date(y, m - 1, d);
      return {
        monthName: dt.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(),
        dayNum: dt.getDate(),
        dayName: dt.toLocaleDateString('en-US', { weekday: 'long' }),
        formattedDateString: dt.toLocaleDateString('en-US', {
          weekday: 'long',
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
      };
    } catch {
      return {
        monthName: 'NOV',
        dayNum: 9,
        dayName: 'Monday',
        formattedDateString: 'Monday, November 9, 2026',
      };
    }
  }, [date]);

  // Persist customized event to Unified AI internal calendar and localStorage
  const handleSaveToUnifiedCalendar = useCallback(async () => {
    try {
      setIsSavedToUnified(true);

      const [y, m, d] = date.split('-').map(Number);
      const [sh, sm] = startTime.split(':').map(Number);
      const [eh, em] = endTime.split(':').map(Number);
      const startDt = new Date(y, m - 1, d, sh || 9, sm || 0);
      const endDt = new Date(y, m - 1, d, eh || 12, em || 0);

      // Save to user-scoped LocalStorage
      const localKey = `${getUserStoragePrefix()}calendar_events_v1`;
      const existingRaw = localStorage.getItem(localKey);
      const list = existingRaw ? JSON.parse(existingRaw) : [];

      const newEvt = {
        id: `evt-${Date.now()}`,
        title: title.trim(),
        description: notes.trim(),
        location: location.trim(),
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
        color: 'blue',
        created_at: new Date().toISOString(),
        type: 'event',
      };

      list.unshift(newEvt);
      localStorage.setItem(localKey, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('calendar-updated'));

      // Save to Worker backend API
      await createCalendarEvent({
        title: title.trim(),
        description: notes.trim(),
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
        all_day: false,
        color: 'blue',
      }).catch(() => {});
    } catch (err) {
      console.warn('Failed to save to unified calendar:', err);
    }
  }, [title, date, startTime, endTime, notes, location]);

  // Auto-save initial version once on mount
  useEffect(() => {
    handleSaveToUnifiedCalendar();
  }, [handleSaveToUnifiedCalendar]);

  // Switch subject chip
  const handleSelectSubject = (subj: string) => {
    setSelectedSubject(subj);
    setTitle(`${subj} Exam`);
  };

  // Switch quick time slot
  const handleSelectTimeSlot = (slot: typeof QUICK_TIME_SLOTS[0]) => {
    setStartTime(slot.start);
    setEndTime(slot.end);
  };

  // Dynamic Google Calendar Link
  const googleCalendarUrl = useMemo(() => {
    const cleanDate = date.replace(/-/g, '');
    const cleanStart = startTime.replace(/:/g, '') + '00';
    const cleanEnd = endTime.replace(/:/g, '') + '00';
    const dates = `${cleanDate}T${cleanStart}/${cleanDate}T${cleanEnd}`;
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: dates,
      details: `${notes}\n\nPrepared on Unified AI Assistant: https://unified-ai-assistant.cortexbuild1.workers.dev`,
      location: location || 'Exam Center / Campus',
      ctz: userTimeZone,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }, [title, date, startTime, endTime, notes, location, userTimeZone]);

  // Dynamic Outlook Calendar Link
  const outlookCalendarUrl = useMemo(() => {
    const startIso = `${date}T${startTime}:00`;
    const endIso = `${date}T${endTime}:00`;
    const params = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      subject: title,
      startdt: startIso,
      enddt: endIso,
      body: notes,
      location: location || 'Campus / Online Exam',
    });
    return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
  }, [title, date, startTime, endTime, notes, location]);

  // Instant .ics File Download
  const downloadIcsFile = () => {
    const cleanDate = date.replace(/-/g, '');
    const cleanStart = startTime.replace(/:/g, '') + '00';
    const cleanEnd = endTime.replace(/:/g, '') + '00';
    const uid = `exam-${Date.now()}@unified-ai`;

    const icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Unified AI//Exam Scheduler//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${cleanDate}T${cleanStart}Z`,
      `DTSTART:${cleanDate}T${cleanStart}`,
      `DTEND:${cleanDate}T${cleanEnd}`,
      `SUMMARY:${title}`,
      `DESCRIPTION:${notes.replace(/\n/g, '\\n')}`,
      `LOCATION:${location}`,
      'STATUS:CONFIRMED',
      'PRIORITY:1',
      'BEGIN:VALARM',
      'TRIGGER:-PT60M',
      'ACTION:DISPLAY',
      `DESCRIPTION:Reminder: ${title} in 1 hour`,
      'END:VALARM',
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n');

    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Switch to internal Calendar & Tasks view
  const handleOpenCalendarView = () => {
    if (onNavigateToCalendar) {
      onNavigateToCalendar();
    } else {
      window.dispatchEvent(
        new CustomEvent('navigate-section', { detail: { section: 'calendar' } })
      );
    }
  };

  // Add as actionable task in Task Manager
  const handleSaveAsTask = async () => {
    try {
      setIsSavedAsTask(true);
      const localKey = `${getUserStoragePrefix()}tasks_v1`;
      const existingRaw = localStorage.getItem(localKey);
      const list = existingRaw ? JSON.parse(existingRaw) : [];
      const newTask = {
        id: `task-${Date.now()}`,
        title: `Prepare & Take: ${title}`,
        description: notes,
        priority: 'high',
        status: 'pending',
        due_date: `${date}T${startTime}:00`,
        created_at: new Date().toISOString(),
      };
      list.unshift(newTask);
      localStorage.setItem(localKey, JSON.stringify(list));
      window.dispatchEvent(new CustomEvent('task-updated'));
      await createTask({
        title: `Prepare & Take: ${title}`,
        description: notes,
        priority: 'high',
        due_date: `${date}T${startTime}:00`,
      }).catch(() => {});
    } catch (err) {
      console.warn('Failed to add as task:', err);
    }
  };

  return (
    <div className="smart-scheduler-card">
      {/* Top Header */}
      <div className="sched-header">
        <div className="sched-header-left">
          <div className="sched-icon-pill">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="4" width="18" height="18" rx="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span>Calendar Event</span>
          </div>
          <span className="sched-sync-badge">
            <span className="sched-live-dot" />
            {isSavedToUnified ? 'Saved to Calendar' : 'Draft'}
          </span>
          <span className="sched-tz-badge" title={`Detected local timezone: ${userTimeZone}`}>
            {userTimeZone.split('/').pop()?.replace(/_/g, ' ') || userTimeZone}
          </span>
        </div>

        <button
          type="button"
          className="sched-view-cal-link"
          onClick={handleOpenCalendarView}
          title="Open Calendar tab"
        >
          <span>Open Calendar</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      </div>

      {/* Main Interactive Form Body */}
      <div className="sched-body">
        {/* Date Display Badge */}
        <div className="sched-date-badge" title={formattedDateString}>
          <span className="sched-date-month">{monthName}</span>
          <span className="sched-date-day">{dayNum}</span>
          <span className="sched-date-weekday">{dayName.slice(0, 3)}</span>
        </div>

        {/* Form Fields for Instant Customization */}
        <div className="sched-fields-container">
          {/* Title / Subject Input */}
          <div className="sched-field-row">
            <label className="sched-field-label">Exam Subject / Title:</label>
            <input
              type="text"
              className="sched-text-input"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                setIsSavedToUnified(false);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void handleSaveToUnifiedCalendar();
                }
              }}
              placeholder="e.g. Chemistry Exam, Math Midterm"
            />
          </div>

          {/* Quick Subject Filter Chips */}
          <div className="sched-chips-row">
            <span className="sched-chips-label">Quick Select:</span>
            {COMMON_SUBJECTS.map((subj) => (
              <button
                key={subj}
                type="button"
                className={`sched-chip ${selectedSubject === subj ? 'active' : ''}`}
                onClick={() => {
                  handleSelectSubject(subj);
                  setIsSavedToUnified(false);
                }}
              >
                {subj}
              </button>
            ))}
          </div>

          {/* Date & Time Selectors */}
          <div className="sched-datetime-grid">
            <div className="sched-datetime-item">
              <label className="sched-field-label">Date:</label>
              <input
                type="date"
                className="sched-date-input"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setIsSavedToUnified(false);
                }}
              />
            </div>

            <div className="sched-datetime-item">
              <label className="sched-field-label">Start Time:</label>
              <input
                type="time"
                className="sched-time-input"
                value={startTime}
                onChange={(e) => {
                  setStartTime(e.target.value);
                  setIsSavedToUnified(false);
                }}
              />
            </div>

            <div className="sched-datetime-item">
              <label className="sched-field-label">End Time:</label>
              <input
                type="time"
                className="sched-time-input"
                value={endTime}
                onChange={(e) => {
                  setEndTime(e.target.value);
                  setIsSavedToUnified(false);
                }}
              />
            </div>
          </div>

          {/* Quick Time Slots */}
          <div className="sched-chips-row">
            <span className="sched-chips-label">Slot:</span>
            {QUICK_TIME_SLOTS.map((slot) => (
              <button
                key={slot.label}
                type="button"
                className={`sched-chip ${startTime === slot.start ? 'active' : ''}`}
                onClick={() => {
                  handleSelectTimeSlot(slot);
                  setIsSavedToUnified(false);
                }}
              >
                {slot.label}
              </button>
            ))}
          </div>

          {/* Editable Notes / Syllabus */}
          <div className="sched-notes-row">
            <div className="sched-notes-header">
              <label className="sched-field-label">Syllabus / Review Notes:</label>
              <button
                type="button"
                className="sched-notes-toggle-btn"
                onClick={() => setIsEditingNotes(!isEditingNotes)}
              >
                {isEditingNotes ? 'Done' : 'Edit Notes'}
              </button>
            </div>
            {isEditingNotes ? (
              <textarea
                className="sched-notes-textarea"
                rows={2}
                value={notes}
                onChange={(e) => {
                  setNotes(e.target.value);
                  setIsSavedToUnified(false);
                }}
                placeholder="Key formulas, chapters, or topics to review..."
              />
            ) : (
              <p className="sched-notes-preview">{notes}</p>
            )}
          </div>
        </div>
      </div>

      {/* Action Footer & Direct Multi-App Sync */}
      <div className="sched-footer">
        <div className="sched-primary-actions">
          {/* Save / Update Unified Calendar Button */}
          <button
            type="button"
            className={`sched-save-btn ${isSavedToUnified ? 'saved' : ''}`}
            onClick={handleSaveToUnifiedCalendar}
            title="Save event to Calendar"
          >
            {isSavedToUnified ? (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <span>Saved to Calendar</span>
              </>
            ) : (
              <>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                  <polyline points="17 21 17 13 7 13 7 21" />
                  <polyline points="7 3 7 8 15 8" />
                </svg>
                <span>Save Event</span>
              </>
            )}
          </button>

          {/* Add to Tasks checklist */}
          <button
            type="button"
            className={`sched-task-btn ${isSavedAsTask ? 'saved' : ''}`}
            onClick={handleSaveAsTask}
            disabled={isSavedAsTask}
            title="Add as task"
          >
            {isSavedAsTask ? '✓ Added to Tasks' : '+ Add to Tasks'}
          </button>
        </div>

        {/* Multi-App Export */}
        <div className="sched-export-row">
          <span className="sched-export-label">Sync / Export:</span>
          <div className="sched-export-buttons">
            {/* Google Calendar */}
            <a
              href={googleCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sched-app-link sched-app-link--google"
              title="Add directly to Google Calendar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="18" rx="3" fill="#4285F4" />
                <path d="M7 2v4M17 2v4M2 8h20" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                <circle cx="12" cy="14" r="3" fill="#fff" />
              </svg>
              <span>Google Calendar</span>
            </a>

            {/* Apple Calendar / iCal (.ics) */}
            <button
              type="button"
              onClick={downloadIcsFile}
              className="sched-app-link sched-app-link--apple"
              title="Download .ics file for Apple Calendar, Mac & iOS"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Apple / iCal (.ics)</span>
            </button>

            {/* Outlook */}
            <a
              href={outlookCalendarUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="sched-app-link sched-app-link--outlook"
              title="Add directly to Microsoft Outlook Calendar"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none">
                <rect x="2" y="3" width="20" height="18" rx="3" fill="#0078D4" />
                <path d="M7 2v4M17 2v4M2 8h20" stroke="#fff" strokeWidth="2" strokeLinecap="round" />
                <text x="12" y="16" fill="#fff" fontSize="8" fontWeight="bold" textAnchor="middle">O</text>
              </svg>
              <span>Outlook</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
