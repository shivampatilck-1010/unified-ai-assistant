import { useState, useEffect, useCallback, useId } from 'react';
import type {
  CalendarEvent,
  CalendarEventOccurrence,
  ExtractedEventProposal,
  ExtractedReminderProposal,
  ExtractedTaskProposal,
  ExtractResponse,
  Reminder,
  Task,
  TaskPriority,
} from '../../types';
import {
  fetchTasks,
  createTask,
  toggleTask,
  deleteTask,
  fetchCalendarEvents,
  createCalendarEvent,
  deleteCalendarEvent,
  fetchReminders,
  dismissReminder,
  extractTasksAndEvents,
  fetchAutomations,
  createAutomation,
  type AutomationItem,
} from '../../lib/api';
import './CalendarTasksView.css';

type ActiveTab = 'tasks' | 'calendar' | 'reminders' | 'automations';

export function CalendarTasksView() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tasks');
  const naturalLanguageInputId = useId();

  // Tasks state
  const [tasks, setTasks] = useState<Task[]>([]);
  const [taskFilter, setTaskFilter] = useState<string>('all');
  const [taskPriorityFilter, setTaskPriorityFilter] = useState<string>('all');
  const [taskSearch, setTaskSearch] = useState('');
  const [tasksLoading, setTasksLoading] = useState(false);
  const [showNewTaskModal, setShowNewTaskModal] = useState(false);

  // New task form state
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDesc, setNewTaskDesc] = useState('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('medium');
  const [newTaskDue, setNewTaskDue] = useState('');

  // Calendar events state
  const [_events, setEvents] = useState<CalendarEvent[]>([]);
  const [occurrences, setOccurrences] = useState<CalendarEventOccurrence[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [showNewEventModal, setShowNewEventModal] = useState(false);

  // New event form state
  const [newEventTitle, setNewEventTitle] = useState('');
  const [newEventDesc, setNewEventDesc] = useState('');
  const [newEventStart, setNewEventStart] = useState('');
  const [newEventEnd, setNewEventEnd] = useState('');
  const [newEventAllDay, setNewEventAllDay] = useState(false);
  const [newEventLocation, setNewEventLocation] = useState('');
  const [newEventRecurrence, setNewEventRecurrence] = useState('');
  const [newEventColor, setNewEventColor] = useState('blue');

  // Reminders state
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [remindersLoading, setRemindersLoading] = useState(false);

  // Natural Language Quick-Add state
  const [nlText, setNlText] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionResult, setExtractionResult] = useState<ExtractResponse | null>(null);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [confirmedTasks, setConfirmedTasks] = useState<ExtractedTaskProposal[]>([]);
  const [confirmedEvents, setConfirmedEvents] = useState<ExtractedEventProposal[]>([]);
  const [confirmedReminders, setConfirmedReminders] = useState<ExtractedReminderProposal[]>([]);
  const [isSavingConfirmed, setIsSavingConfirmed] = useState(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // Phase 8: Automations State
  const [automations, setAutomations] = useState<AutomationItem[]>([]);
  const [automationsLoading, setAutomationsLoading] = useState(false);
  const [showNewAutomationModal, setShowNewAutomationModal] = useState(false);
  const [newAutoName, setNewAutoName] = useState('');
  const [newAutoGoal, setNewAutoGoal] = useState('');
  const [newAutoCapability, setNewAutoCapability] = useState('report');
  const [newAutoInterval, setNewAutoInterval] = useState(24);

  const loadAutomations = useCallback(async () => {
    try {
      setAutomationsLoading(true);
      const res = await fetchAutomations();
      setAutomations(res);
    } catch (err: unknown) {
      console.error('Failed to load automations:', err);
    } finally {
      setAutomationsLoading(false);
    }
  }, []);

  const handleCreateAutomation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAutoName.trim() || !newAutoGoal.trim()) return;
    try {
      await createAutomation({
        name: newAutoName.trim(),
        task_goal: newAutoGoal.trim(),
        capability: newAutoCapability,
        interval_hours: newAutoInterval,
      });
      setShowNewAutomationModal(false);
      setNewAutoName('');
      setNewAutoGoal('');
      await loadAutomations();
    } catch (err: unknown) {
      console.error('Failed to create automation:', err);
    }
  };

  // 1. Load tasks
  const loadTasks = useCallback(async () => {
    try {
      setTasksLoading(true);
      const res = await fetchTasks({
        status: taskFilter === 'all' ? undefined : taskFilter,
        priority: taskPriorityFilter === 'all' ? undefined : taskPriorityFilter,
        search: taskSearch.trim() || undefined,
      });
      setTasks(res.items);
      let localTasks: Task[] = [];
      try {
        const raw = localStorage.getItem('unified_ai_tasks_v1');
        if (raw) localTasks = JSON.parse(raw);
      } catch {}
      if (localTasks.length > 0) {
        setTasks((prev) => {
          const map = new Map<string, Task>();
          prev.forEach((t) => map.set(t.id, t));
          localTasks.forEach((t) => map.set(t.id, t));
          return Array.from(map.values());
        });
      }
    } catch (err) {
      console.error('Failed to load tasks:', err);
    } finally {
      setTasksLoading(false);
    }
  }, [taskFilter, taskPriorityFilter, taskSearch]);

  // 2. Load calendar events
  const loadCalendar = useCallback(async () => {
    try {
      setCalendarLoading(true);
      const res = await fetchCalendarEvents();
      setEvents(res.events || []);
      setOccurrences(res.occurrences || []);
      try {
        const raw = localStorage.getItem('unified_ai_calendar_events_v1');
        if (raw) {
          const localEvents = JSON.parse(raw);
          if (Array.isArray(localEvents) && localEvents.length > 0) {
            setEvents((prev) => {
              const map = new Map();
              prev.forEach((e) => map.set(e.id, e));
              localEvents.forEach((e) => map.set(e.id, e));
              const list = Array.from(map.values());
              setOccurrences(
                list.map((e) => ({
                  event: e,
                  start_time: e.start_time,
                  end_time: e.end_time,
                }))
              );
              return list;
            });
          }
        }
      } catch {}
    } catch (err) {
      console.error('Failed to load calendar events:', err);
    } finally {
      setCalendarLoading(false);
    }
  }, []);

  // 3. Load reminders
  const loadReminders = useCallback(async () => {
    try {
      setRemindersLoading(true);
      const res = await fetchReminders(false);
      setReminders(res.items);
    } catch (err) {
      console.error('Failed to load reminders:', err);
    } finally {
      setRemindersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTasks();
    void loadCalendar();
    void loadReminders();
  }, [loadTasks, loadCalendar, loadReminders]);

  // Task actions
  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    try {
      const isCompleted = currentStatus === 'completed';
      const updated = await toggleTask(taskId, !isCompleted);
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));
    } catch (err) {
      console.error('Failed to toggle task:', err);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await deleteTask(taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
    } catch (err) {
      console.error('Failed to delete task:', err);
    }
  };

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTaskTitle.trim()) return;
    try {
      const created = await createTask({
        title: newTaskTitle.trim(),
        description: newTaskDesc.trim() || null,
        priority: newTaskPriority,
        due_date: newTaskDue ? new Date(newTaskDue).toISOString() : null,
      });
      setTasks((prev) => [created, ...prev]);
      setNewTaskTitle('');
      setNewTaskDesc('');
      setNewTaskDue('');
      setShowNewTaskModal(false);
    } catch (err) {
      console.error('Failed to create task:', err);
    }
  };

  // Calendar actions
  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEventTitle.trim() || !newEventStart || !newEventEnd) return;
    try {
      await createCalendarEvent({
        title: newEventTitle.trim(),
        description: newEventDesc.trim() || null,
        start_time: new Date(newEventStart).toISOString(),
        end_time: new Date(newEventEnd).toISOString(),
        all_day: newEventAllDay,
        location: newEventLocation.trim() || null,
        recurrence_rule: newEventRecurrence.trim() || null,
        color: newEventColor,
      });
      setNewEventTitle('');
      setNewEventDesc('');
      setNewEventStart('');
      setNewEventEnd('');
      setNewEventRecurrence('');
      setShowNewEventModal(false);
      void loadCalendar();
    } catch (err) {
      console.error('Failed to create event:', err);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await deleteCalendarEvent(eventId);
      void loadCalendar();
    } catch (err) {
      console.error('Failed to delete event:', err);
    }
  };

  // Reminder actions
  const handleDismissReminder = async (reminderId: string) => {
    try {
      const updated = await dismissReminder(reminderId);
      setReminders((prev) => prev.map((r) => (r.id === reminderId ? updated : r)));
    } catch (err) {
      console.error('Failed to dismiss reminder:', err);
    }
  };

  // Natural Language Extraction
  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nlText.trim()) return;
    setIsExtracting(true);
    setExtractError(null);
    setSaveSuccessMsg(null);
    setExtractionResult(null);

    try {
      const res = await extractTasksAndEvents({
        text: nlText.trim(),
        reference_time: new Date().toISOString(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      });
      setExtractionResult(res);
      setConfirmedTasks(res.tasks);
      setConfirmedEvents(res.events);
      setConfirmedReminders(res.reminders);
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setIsExtracting(false);
    }
  };

  // Human Confirmation & Batch Save
  const handleSaveConfirmed = async () => {
    setIsSavingConfirmed(true);
    setSaveSuccessMsg(null);
    try {
      let taskCount = 0;
      let eventCount = 0;

      // 1. Create confirmed tasks
      for (const t of confirmedTasks) {
        await createTask({
          title: t.title,
          description: t.description || null,
          priority: t.priority,
          due_date: t.due_date,
          timezone: t.timezone,
        });
        taskCount++;
      }

      // 2. Create confirmed events
      for (const ev of confirmedEvents) {
        await createCalendarEvent({
          title: ev.title,
          description: ev.description || null,
          start_time: ev.start_time,
          end_time: ev.end_time,
          timezone: ev.timezone,
          all_day: ev.all_day,
          location: ev.location || null,
          recurrence_rule: ev.recurrence_rule || null,
        });
        eventCount++;
      }

      setSaveSuccessMsg(`Successfully saved ${taskCount} task(s) and ${eventCount} event(s)!`);
      setExtractionResult(null);
      setNlText('');
      void loadTasks();
      void loadCalendar();
      void loadReminders();
    } catch (err) {
      setExtractError(err instanceof Error ? err.message : 'Failed to save confirmed items');
    } finally {
      setIsSavingConfirmed(false);
    }
  };

  // Delivered reminders for alert banner
  const activeAlerts = reminders.filter((r) => r.status === 'delivered');

  return (
    <div className="caltasks-container">
      {/* Alert Banner for Due/Delivered Reminders */}
      {activeAlerts.length > 0 && (
        <aside aria-label="Active Reminders" className="caltasks-alerts-banner">
          <div className="caltasks-alerts-banner__header">
            <span className="caltasks-alerts-banner__icon">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1.5a4.5 4.5 0 00-4.5 4.5v3.25L2 11.5v1h12v-1l-1.5-2.25V6A4.5 4.5 0 008 1.5zM6.5 13.5a1.5 1.5 0 003 0h-3z" />
              </svg>
            </span>
            <strong>Active Reminders ({activeAlerts.length})</strong>
          </div>
          <div className="caltasks-alerts-banner__list">
            {activeAlerts.map((alert) => (
              <div key={alert.id} className="caltasks-alert-item">
                <span className="caltasks-alert-item__title">{alert.title}</span>
                <span className="caltasks-alert-item__time">
                  {new Date(alert.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <button
                  type="button"
                  className="caltasks-btn caltasks-btn--small"
                  onClick={() => handleDismissReminder(alert.id)}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        </aside>
      )}

      {/* Header and Subnavigation */}
      <div className="caltasks-header">
        <div className="caltasks-header__title-group">
          <h1 className="caltasks-title">Calendar & Tasks</h1>
          <p className="caltasks-subtitle">
            Internal scheduling, task tracking, and AI-assisted extraction with operator confirmation.
          </p>
        </div>

        <nav aria-label="Calendar and tasks views" className="caltasks-tabs">
          <button
            type="button"
            className={`caltasks-tab ${activeTab === 'tasks' ? 'caltasks-tab--active' : ''}`}
            onClick={() => setActiveTab('tasks')}
          >
            Tasks ({tasks.length})
          </button>
          <button
            type="button"
            className={`caltasks-tab ${activeTab === 'calendar' ? 'caltasks-tab--active' : ''}`}
            onClick={() => setActiveTab('calendar')}
          >
            Calendar & Agenda ({occurrences.length})
          </button>
          <button
            type="button"
            className={`caltasks-tab ${activeTab === 'reminders' ? 'caltasks-tab--active' : ''}`}
            onClick={() => setActiveTab('reminders')}
          >
            Reminders ({reminders.length})
          </button>
          <button
            type="button"
            className={`caltasks-tab ${activeTab === 'automations' ? 'caltasks-tab--active' : ''}`}
            onClick={() => {
              setActiveTab('automations');
              if (automations.length === 0) void loadAutomations();
            }}
          >
            Automations ({automations.length > 0 ? automations.length : 'Phase 8'})
          </button>
        </nav>
      </div>

      {/* Natural Language Quick-Add Card */}
      <div className="caltasks-quickadd-card">
        <div className="caltasks-quickadd-header">
          <span className="caltasks-quickadd-icon">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
              <path d="M9 1L3 9h4l-1 6 6-8H8l1-6z" />
            </svg>
          </span>
          <div>
            <h3>Natural Language Quick-Add</h3>
            <p>Type requests in plain English (e.g. &ldquo;Team sync tomorrow at 3pm, finish slides by Friday 5pm&rdquo;)</p>
          </div>
        </div>

        <form onSubmit={handleExtract} className="caltasks-quickadd-form">
          <label htmlFor={naturalLanguageInputId} className="caltasks-sr-only">
            Natural language task or event description
          </label>
          <input
            id={naturalLanguageInputId}
            type="text"
            className="caltasks-input caltasks-quickadd-input"
            placeholder="e.g. Prepare design review by Thursday 2pm and remind me 1 hour before..."
            value={nlText}
            onChange={(e) => setNlText(e.target.value)}
            disabled={isExtracting}
          />
          <button
            type="submit"
            className="caltasks-btn caltasks-btn--primary"
            disabled={isExtracting || !nlText.trim()}
          >
            {isExtracting ? 'Analyzing...' : 'Extract Items'}
          </button>
        </form>

        {extractError && <div className="caltasks-error-banner">{extractError}</div>}
        {saveSuccessMsg && <div className="caltasks-success-banner">{saveSuccessMsg}</div>}

        {/* Human Confirmation Review Drawer */}
        {extractionResult && (
          <div className="caltasks-review-drawer">
            <div className="caltasks-review-drawer__header">
              <h4>Review & Confirm Proposed Items</h4>
              <span className="caltasks-badge caltasks-badge--review">Confirmation Required</span>
            </div>
            {extractionResult.explanation && (
              <p className="caltasks-review-drawer__expl">{extractionResult.explanation}</p>
            )}

            {confirmedTasks.length > 0 && (
              <div className="caltasks-review-section">
                <h5>Proposed Tasks ({confirmedTasks.length})</h5>
                {confirmedTasks.map((t, idx) => (
                  <div key={idx} className="caltasks-review-item">
                    <span className="caltasks-review-item__title">{t.title}</span>
                    <span className={`caltasks-priority-badge caltasks-priority-badge--${t.priority}`}>
                      {t.priority}
                    </span>
                    {t.due_date && (
                      <span className="caltasks-review-item__date">
                        Due: {new Date(t.due_date).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {confirmedEvents.length > 0 && (
              <div className="caltasks-review-section">
                <h5>Proposed Calendar Events ({confirmedEvents.length})</h5>
                {confirmedEvents.map((ev, idx) => (
                  <div key={idx} className="caltasks-review-item">
                    <span className="caltasks-review-item__title">{ev.title}</span>
                    <span className="caltasks-review-item__date">
                      {new Date(ev.start_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                    {ev.location && <span className="caltasks-review-item__loc">Location: {ev.location}</span>}
                  </div>
                ))}
              </div>
            )}

            {confirmedReminders.length > 0 && (
              <div className="caltasks-review-section">
                <h5>Proposed Reminders ({confirmedReminders.length})</h5>
                {confirmedReminders.map((rem, idx) => (
                  <div key={idx} className="caltasks-review-item">
                    <span className="caltasks-review-item__title">{rem.title}</span>
                    <span className="caltasks-review-item__date">
                      {new Date(rem.scheduled_time).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="caltasks-review-drawer__actions">
              <button
                type="button"
                className="caltasks-btn caltasks-btn--primary"
                onClick={handleSaveConfirmed}
                disabled={isSavingConfirmed}
              >
                {isSavingConfirmed ? 'Saving to Database...' : 'Confirm & Save Items'}
              </button>
              <button
                type="button"
                className="caltasks-btn"
                onClick={() => setExtractionResult(null)}
                disabled={isSavingConfirmed}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* TAB 1: TASKS */}
      {activeTab === 'tasks' && (
        <div className="caltasks-tab-content">
          <div className="caltasks-controls-bar">
            <div className="caltasks-search-box">
              <input
                type="text"
                placeholder="Search tasks..."
                value={taskSearch}
                onChange={(e) => setTaskSearch(e.target.value)}
                className="caltasks-input"
              />
            </div>

            <div className="caltasks-filter-group">
              <select
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value)}
                className="caltasks-select"
                aria-label="Filter tasks by status"
              >
                <option value="all">All Statuses</option>
                <option value="pending">Pending</option>
                <option value="in_progress">In Progress</option>
                <option value="completed">Completed</option>
              </select>

              <select
                value={taskPriorityFilter}
                onChange={(e) => setTaskPriorityFilter(e.target.value)}
                className="caltasks-select"
                aria-label="Filter tasks by priority"
              >
                <option value="all">All Priorities</option>
                <option value="urgent">Urgent</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>

              <button
                type="button"
                className="caltasks-btn caltasks-btn--primary"
                onClick={() => setShowNewTaskModal(true)}
              >
                + New Task
              </button>
            </div>
          </div>

          {tasksLoading ? (
            <div className="caltasks-loading">Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <div className="caltasks-empty">No tasks found. Create one above or use quick-add.</div>
          ) : (
            <div className="caltasks-list">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className={`caltasks-card ${task.status === 'completed' ? 'caltasks-card--completed' : ''}`}
                >
                  <div className="caltasks-card__left">
                    <button
                      type="button"
                      className={`caltasks-checkbox ${task.status === 'completed' ? 'caltasks-checkbox--checked' : ''}`}
                      onClick={() => handleToggleTask(task.id, task.status)}
                      title={task.status === 'completed' ? 'Mark pending' : 'Mark completed'}
                    >
                      {task.status === 'completed' && '✓'}
                    </button>
                    <div className="caltasks-card__body">
                      <h4 className="caltasks-card__title">{task.title}</h4>
                      {task.description && <p className="caltasks-card__desc">{task.description}</p>}
                      <div className="caltasks-card__meta">
                        <span className={`caltasks-priority-badge caltasks-priority-badge--${task.priority}`}>
                          {task.priority}
                        </span>
                        {task.due_date && (
                          <span className="caltasks-card__due">
                            Due: {new Date(task.due_date).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="caltasks-card__actions">
                    <button
                      type="button"
                      className="caltasks-btn caltasks-btn--danger caltasks-btn--small"
                      onClick={() => handleDeleteTask(task.id)}
                      title="Delete task"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: CALENDAR & AGENDA */}
      {activeTab === 'calendar' && (
        <div className="caltasks-tab-content">
          <div className="caltasks-controls-bar">
            <div className="caltasks-header-info">
              <h3>Upcoming Agenda ({occurrences.length} instances)</h3>
              <p>Chronological schedule with recurring rules and timezone support</p>
            </div>
            <button
              type="button"
              className="caltasks-btn caltasks-btn--primary"
              onClick={() => setShowNewEventModal(true)}
            >
              + New Event
            </button>
          </div>

          {calendarLoading ? (
            <div className="caltasks-loading">Loading calendar...</div>
          ) : occurrences.length === 0 ? (
            <div className="caltasks-empty">No events scheduled. Add an event to begin.</div>
          ) : (
            <div className="caltasks-agenda-list">
              {occurrences.map((occ, idx) => (
                <div key={`${occ.event_id}-${idx}`} className="caltasks-agenda-item">
                  <div className="caltasks-agenda-item__time-col">
                    <span className="caltasks-agenda-item__date">
                      {new Date(occ.start_time).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                    <span className="caltasks-agenda-item__time">
                      {occ.all_day
                        ? 'All Day'
                        : `${new Date(occ.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} - ${new Date(occ.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                    </span>
                  </div>

                  <div className="caltasks-agenda-item__content">
                    <div className="caltasks-agenda-item__top">
                      <h4 className="caltasks-agenda-item__title">{occ.title}</h4>
                      {occ.is_recurring && (
                        <span className="caltasks-badge caltasks-badge--recurring" title={occ.recurrence_rule || ''}>
                          Recurring
                        </span>
                      )}
                    </div>
                    {occ.description && <p className="caltasks-agenda-item__desc">{occ.description}</p>}
                    {occ.location && <div className="caltasks-agenda-item__loc">Location: {occ.location}</div>}
                  </div>

                  <div className="caltasks-agenda-item__actions">
                    <button
                      type="button"
                      className="caltasks-btn caltasks-btn--danger caltasks-btn--small"
                      onClick={() => handleDeleteEvent(occ.event_id)}
                      title="Delete event"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: REMINDERS */}
      {activeTab === 'reminders' && (
        <div className="caltasks-tab-content">
          <div className="caltasks-controls-bar">
            <div>
              <h3>Internal Reminders ({reminders.length})</h3>
              <p>Reliable background scheduler with atomic delivery and recovery</p>
            </div>
          </div>

          {remindersLoading ? (
            <div className="caltasks-loading">Loading reminders...</div>
          ) : reminders.length === 0 ? (
            <div className="caltasks-empty">No reminders scheduled.</div>
          ) : (
            <div className="caltasks-list">
              {reminders.map((rem) => (
                <div key={rem.id} className="caltasks-card">
                  <div className="caltasks-card__left">
                    <span className="caltasks-reminder-icon">⏰</span>
                    <div>
                      <h4 className="caltasks-card__title">{rem.title}</h4>
                      <div className="caltasks-card__meta">
                        <span>Trigger: {new Date(rem.scheduled_time).toLocaleString()}</span>
                        <span className={`caltasks-badge caltasks-badge--${rem.status}`}>{rem.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="caltasks-card__actions">
                    {rem.status !== 'dismissed' && (
                      <button
                        type="button"
                        className="caltasks-btn caltasks-btn--small"
                        onClick={() => handleDismissReminder(rem.id)}
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SCHEDULED AUTOMATIONS (PHASE 8) */}
      {activeTab === 'automations' && (
        <div className="caltasks-tab-content">
          <div className="caltasks-controls-bar">
            <div className="caltasks-filters">
              <span className="caltasks-meta" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#10b981' }} />
                Autonomous Recurring Background Tasks
              </span>
            </div>

            <div className="caltasks-actions">
              <button
                type="button"
                className="caltasks-btn caltasks-btn--primary"
                onClick={() => setShowNewAutomationModal(true)}
              >
                + Register Automation
              </button>
            </div>
          </div>

          {automationsLoading ? (
            <div className="caltasks-loading">Loading scheduled automations...</div>
          ) : automations.length === 0 ? (
            <div className="caltasks-empty-state">
              <p>No recurring automations registered yet.</p>
              <button
                type="button"
                className="caltasks-btn caltasks-btn--primary"
                onClick={() => setShowNewAutomationModal(true)}
              >
                Create First Automation
              </button>
            </div>
          ) : (
            <div className="caltasks-grid">
              {automations.map((auto) => (
                <div key={auto.id} className="caltasks-card">
                  <div className="caltasks-card__main">
                    <div className="caltasks-card__header">
                      <h4 className="caltasks-card__title">{auto.name}</h4>
                      <span className="caltasks-tag caltasks-tag--priority-high">
                        Every {auto.interval_hours || 24}h
                      </span>
                    </div>
                    <p className="caltasks-card__desc">{auto.task_goal}</p>
                    <div className="caltasks-card__meta">
                      <div className="caltasks-card__meta-item">
                        <span>Capability: <strong>{auto.capability}</strong></span>
                      </div>
                      <div className="caltasks-card__meta-item">
                        <span>Status: <strong style={{ color: '#10b981' }}>{auto.enabled ? 'ACTIVE' : 'PAUSED'}</strong></span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal: New Automation */}
      {showNewAutomationModal && (
        <div className="caltasks-modal-overlay">
          <div className="caltasks-modal">
            <h3>Register Scheduled Automation (Phase 8)</h3>
            <form onSubmit={handleCreateAutomation}>
              <div className="caltasks-field">
                <label>Automation Name *</label>
                <input
                  type="text"
                  required
                  value={newAutoName}
                  onChange={(e) => setNewAutoName(e.target.value)}
                  className="caltasks-input"
                  placeholder="e.g. Daily Tech & Security Briefing"
                />
              </div>

              <div className="caltasks-field">
                <label>Objective & Instructions *</label>
                <textarea
                  required
                  rows={3}
                  value={newAutoGoal}
                  onChange={(e) => setNewAutoGoal(e.target.value)}
                  className="caltasks-textarea"
                  placeholder="e.g. Research top 3 cloud security breakthroughs and prepare a synthesis report."
                />
              </div>

              <div className="caltasks-row">
                <div className="caltasks-field">
                  <label>Capability Engine</label>
                  <select
                    value={newAutoCapability}
                    onChange={(e) => setNewAutoCapability(e.target.value)}
                    className="caltasks-select"
                  >
                    <option value="report">Autonomous Research & Report</option>
                    <option value="browser">Autonomous Browser Task</option>
                    <option value="code_audit">Coding Sandbox Audit</option>
                    <option value="summary">File Intelligence Digest</option>
                  </select>
                </div>

                <div className="caltasks-field">
                  <label>Interval (Hours)</label>
                  <input
                    type="number"
                    min={1}
                    max={168}
                    value={newAutoInterval}
                    onChange={(e) => setNewAutoInterval(Number(e.target.value))}
                    className="caltasks-input"
                  />
                </div>
              </div>

              <div className="caltasks-modal-actions">
                <button
                  type="button"
                  className="caltasks-btn"
                  onClick={() => setShowNewAutomationModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="caltasks-btn caltasks-btn--primary">
                  Save & Enable Schedule
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Task */}
      {showNewTaskModal && (
        <div className="caltasks-modal-overlay">
          <div className="caltasks-modal">
            <h3>Create New Task</h3>
            <form onSubmit={handleCreateTask}>
              <div className="caltasks-field">
                <label>Title *</label>
                <input
                  type="text"
                  required
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  className="caltasks-input"
                  placeholder="Task title..."
                />
              </div>

              <div className="caltasks-field">
                <label>Description</label>
                <textarea
                  value={newTaskDesc}
                  onChange={(e) => setNewTaskDesc(e.target.value)}
                  className="caltasks-input caltasks-textarea"
                  placeholder="Optional details..."
                />
              </div>

              <div className="caltasks-row">
                <div className="caltasks-field">
                  <label>Priority</label>
                  <select
                    value={newTaskPriority}
                    onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                    className="caltasks-select"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                <div className="caltasks-field">
                  <label>Due Date</label>
                  <input
                    type="datetime-local"
                    value={newTaskDue}
                    onChange={(e) => setNewTaskDue(e.target.value)}
                    className="caltasks-input"
                  />
                </div>
              </div>

              <div className="caltasks-modal-actions">
                <button type="submit" className="caltasks-btn caltasks-btn--primary">
                  Save Task
                </button>
                <button
                  type="button"
                  className="caltasks-btn"
                  onClick={() => setShowNewTaskModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Calendar Event */}
      {showNewEventModal && (
        <div className="caltasks-modal-overlay">
          <div className="caltasks-modal">
            <h3>Create Calendar Event</h3>
            <form onSubmit={handleCreateEvent}>
              <div className="caltasks-field">
                <label>Title *</label>
                <input
                  type="text"
                  required
                  value={newEventTitle}
                  onChange={(e) => setNewEventTitle(e.target.value)}
                  className="caltasks-input"
                  placeholder="Event title..."
                />
              </div>

              <div className="caltasks-field">
                <label>Description</label>
                <textarea
                  value={newEventDesc}
                  onChange={(e) => setNewEventDesc(e.target.value)}
                  className="caltasks-input caltasks-textarea"
                  placeholder="Agenda notes..."
                />
              </div>

              <div className="caltasks-row">
                <div className="caltasks-field">
                  <label>Start Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEventStart}
                    onChange={(e) => setNewEventStart(e.target.value)}
                    className="caltasks-input"
                  />
                </div>
                <div className="caltasks-field">
                  <label>End Time *</label>
                  <input
                    type="datetime-local"
                    required
                    value={newEventEnd}
                    onChange={(e) => setNewEventEnd(e.target.value)}
                    className="caltasks-input"
                  />
                </div>
              </div>

              <div className="caltasks-row">
                <div className="caltasks-field">
                  <label>Location</label>
                  <input
                    type="text"
                    value={newEventLocation}
                    onChange={(e) => setNewEventLocation(e.target.value)}
                    className="caltasks-input"
                    placeholder="Conference Room / URL"
                  />
                </div>
                <div className="caltasks-field">
                  <label>Recurrence</label>
                  <select
                    value={newEventRecurrence}
                    onChange={(e) => setNewEventRecurrence(e.target.value)}
                    className="caltasks-select"
                  >
                    <option value="">None (One-time)</option>
                    <option value="FREQ=DAILY;COUNT=10">Daily (10 occurrences)</option>
                    <option value="FREQ=WEEKLY;INTERVAL=1;COUNT=10">Weekly (10 weeks)</option>
                    <option value="FREQ=MONTHLY;INTERVAL=1;COUNT=6">Monthly (6 months)</option>
                  </select>
                </div>
              </div>

              <div className="caltasks-row">
                <div className="caltasks-field">
                  <label>Color Accent</label>
                  <select
                    value={newEventColor}
                    onChange={(e) => setNewEventColor(e.target.value)}
                    className="caltasks-select"
                  >
                    <option value="blue">Blue</option>
                    <option value="teal">Teal</option>
                    <option value="amber">Amber</option>
                    <option value="purple">Purple</option>
                  </select>
                </div>
                <div className="caltasks-field" style={{ justifyContent: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '1rem' }}>
                    <input
                      type="checkbox"
                      checked={newEventAllDay}
                      onChange={(e) => setNewEventAllDay(e.target.checked)}
                    />
                    <span>All-Day Event</span>
                  </label>
                </div>
              </div>

              <div className="caltasks-modal-actions">
                <button type="submit" className="caltasks-btn caltasks-btn--primary">
                  Save Event
                </button>
                <button
                  type="button"
                  className="caltasks-btn"
                  onClick={() => setShowNewEventModal(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
