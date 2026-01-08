'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import type { DatesSetArg, EventClickArg, EventContentArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin, { type DateClickArg } from '@fullcalendar/interaction';
import TopNav from '../../components/TopNav';
import { api } from '../../lib/api';
import { getReportsLastSeen, setReportsLastSeen, triggerNotificationRefresh } from '../../lib/notifications';
import { useAuth } from '../../lib/useAuth';

type DailyReportStatus = 'draft' | 'in_review' | 'accepted' | 'rejected';

type DailyReport = {
  id: string;
  userId: string;
  reportDate: string;
  status: DailyReportStatus;
  content?: string | null;
  reviewReason?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

type DailyReportAttachment = {
  id: string;
  reportId: string;
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
};

type UploadAttachment = {
  fileUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

type ViewRange = {
  start: string;
  end: string;
};

const STATUS_CONFIG: Record<
  DailyReportStatus,
  { label: string; chip: string; eventBg: string; eventBorder: string; eventText: string }
> = {
  draft: {
    label: 'Draft',
    chip: 'border border-slate-200 bg-slate-100 text-slate-700',
    eventBg: '#e2e8f0',
    eventBorder: '#94a3b8',
    eventText: '#334155',
  },
  in_review: {
    label: 'In review',
    chip: 'border border-sky-200 bg-sky-100 text-sky-700',
    eventBg: '#bae6fd',
    eventBorder: '#38bdf8',
    eventText: '#075985',
  },
  accepted: {
    label: 'Accepted',
    chip: 'border border-emerald-200 bg-emerald-100 text-emerald-700',
    eventBg: '#bbf7d0',
    eventBorder: '#34d399',
    eventText: '#047857',
  },
  rejected: {
    label: 'Rejected',
    chip: 'border border-rose-200 bg-rose-100 text-rose-700',
    eventBg: '#fecdd3',
    eventBorder: '#fb7185',
    eventText: '#9f1239',
  },
};

const STATUS_ORDER: DailyReportStatus[] = ['draft', 'in_review', 'accepted', 'rejected'];

function toDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeDateKey(value: string) {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(value);
  return match ? match[1] : value;
}

function shiftDate(value: string, days: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return value;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [viewRange, setViewRange] = useState<ViewRange | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [draftContent, setDraftContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [todayKey, setTodayKey] = useState(() => toDateKey(new Date()));
  const [attachments, setAttachments] = useState<DailyReportAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState('');
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsError, setReportsError] = useState('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
      return;
    }
  }, [loading, user, token, router]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTodayKey(toDateKey(new Date()));
    }, 60000);
    return () => window.clearInterval(interval);
  }, []);

  const reportMap = useMemo(() => {
    const map = new Map<string, DailyReport>();
    reports.forEach((report) => {
      map.set(report.reportDate, report);
    });
    return map;
  }, [reports]);

  const selectedReport = reportMap.get(selectedDate) ?? null;
  const selectedStatus = selectedReport?.status ?? 'draft';
  const statusConfig = STATUS_CONFIG[selectedStatus];
  const isLocked = selectedStatus === 'accepted';
  const canEditDate = selectedDate <= todayKey;
  const canEdit = isEditing && !isLocked && canEditDate;

  useEffect(() => {
    if (!user) return;
    if (!selectedReport) return;
    if (selectedReport.status !== 'accepted' && selectedReport.status !== 'rejected') return;
    const lastSeen = getReportsLastSeen(user.id, user.role);
    const lastSeenTime = lastSeen ? Date.parse(lastSeen) : null;
    const reviewedAt = selectedReport.reviewedAt ?? selectedReport.updatedAt ?? null;
    const reviewedTime = reviewedAt ? Date.parse(reviewedAt) : null;
    if (reviewedTime !== null && Number.isNaN(reviewedTime)) return;
    if (lastSeenTime !== null && !Number.isNaN(lastSeenTime) && reviewedTime !== null) {
      if (reviewedTime <= lastSeenTime) return;
    }
    setReportsLastSeen(user.id, user.role);
  }, [
    user,
    selectedReport?.id,
    selectedReport?.status,
    selectedReport?.reviewedAt,
    selectedReport?.updatedAt,
  ]);

  useEffect(() => {
    if (!user) return;
    if (reports.length === 0) return;
    const lastSeen = getReportsLastSeen(user.id, user.role);
    const lastSeenTime = lastSeen ? Date.parse(lastSeen) : null;
    const hasFreshReview = reports.some((report) => {
      if (report.status !== 'accepted' && report.status !== 'rejected') return false;
      const reviewedAt = report.reviewedAt ?? report.updatedAt ?? null;
      const reviewedTime = reviewedAt ? Date.parse(reviewedAt) : null;
      if (reviewedTime === null || Number.isNaN(reviewedTime)) return false;
      if (lastSeenTime !== null && !Number.isNaN(lastSeenTime)) {
        return reviewedTime > lastSeenTime;
      }
      return true;
    });
    if (hasFreshReview) {
      setReportsLastSeen(user.id, user.role);
    }
  }, [user, reports]);

  useEffect(() => {
    setDraftContent(selectedReport?.content ?? '');
    setActionError('');
    setAttachmentError('');
  }, [selectedDate, selectedReport?.id, selectedReport?.updatedAt]);

  useEffect(() => {
    setIsEditing(false);
  }, [selectedDate]);

  useEffect(() => {
    if (selectedStatus === 'accepted') {
      setIsEditing(false);
    }
  }, [selectedStatus]);

  useEffect(() => {
    if (!isEditing || canEditDate) return;
    setIsEditing(false);
    setActionError('Future reports cannot be edited yet.');
  }, [isEditing, canEditDate]);

  const loadAttachments = useCallback(async (reportId: string) => {
    setAttachmentsLoading(true);
    setAttachmentError('');
    try {
      const data = await api<DailyReportAttachment[]>(`/daily-reports/${reportId}/attachments`);
      setAttachments(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load attachments.';
      setAttachmentError(message);
      setAttachments([]);
    } finally {
      setAttachmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!selectedReport?.id) {
      setAttachments([]);
      return;
    }
    void loadAttachments(selectedReport.id);
  }, [selectedReport?.id, loadAttachments]);

  const fetchReports = useCallback(async (range: ViewRange, options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (!silent) {
      setReportsLoading(true);
      setReportsError('');
    }
    try {
      const qs = new URLSearchParams({ start: range.start, end: range.end });
      const data = await api<DailyReport[]>(`/daily-reports?${qs.toString()}`);
      setReports(Array.isArray(data) ? data : []);
      if (silent) {
        setReportsError('');
      }
    } catch (err) {
      if (!silent) {
        const message = err instanceof Error ? err.message : 'Unable to load reports.';
        setReportsError(message);
      }
    } finally {
      if (!silent) {
        setReportsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!viewRange || !token) return;
    void fetchReports(viewRange);
  }, [fetchReports, token, viewRange]);

  useEffect(() => {
    if (!viewRange || !token || isEditing) return;
    let active = true;
    const refresh = () => {
      if (!active || isEditing) return;
      void fetchReports(viewRange, { silent: true }).finally(() => {
        if (active) {
          triggerNotificationRefresh();
        }
      });
    };
    refresh();
    const intervalId = window.setInterval(refresh, 30000);
    const handleFocus = () => {
      refresh();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refresh();
      }
    };
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [viewRange?.start, viewRange?.end, token, isEditing, fetchReports]);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const start = normalizeDateKey(info.startStr);
    const endExclusive = normalizeDateKey(info.endStr);
    const end = shiftDate(endExclusive, -1);
    setViewRange({ start, end });
  }, []);

  const handleDateClick = useCallback((info: DateClickArg) => {
    const nextDate = normalizeDateKey(info.dateStr);
    setSelectedDate(nextDate);
    if (!user) return;
    const report = reportMap.get(nextDate);
    if (report?.status === 'accepted' || report?.status === 'rejected') {
      setReportsLastSeen(user.id, user.role);
    }
  }, [user, reportMap]);

  const handleEventClick = useCallback((info: EventClickArg) => {
    if (!info.event.start) return;
    const nextDate = toDateKey(info.event.start);
    setSelectedDate(nextDate);
    if (!user) return;
    const report = reportMap.get(nextDate);
    if (report?.status === 'accepted' || report?.status === 'rejected') {
      setReportsLastSeen(user.id, user.role);
    }
  }, [user, reportMap]);

  const upsertReportInState = useCallback((next: DailyReport) => {
    setReports((prev) => {
      const filtered = prev.filter((report) => report.reportDate !== next.reportDate);
      return [...filtered, next].sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (isLocked || !selectedDate || !isEditing || !canEditDate) return;
    setSaving(true);
    setActionError('');
    try {
      const updated = await api<DailyReport>('/daily-reports/by-date', {
        method: 'PUT',
        body: JSON.stringify({ date: selectedDate, content: draftContent }),
      });
      upsertReportInState(updated);
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save report.';
      setActionError(message);
    } finally {
      setSaving(false);
    }
  }, [draftContent, isLocked, isEditing, canEditDate, selectedDate, upsertReportInState]);

  const handleSend = useCallback(async () => {
    if (isLocked || !selectedDate || !isEditing || !canEditDate) return;
    setSending(true);
    setActionError('');
    try {
      const updated = await api<DailyReport>('/daily-reports/by-date/send', {
        method: 'POST',
        body: JSON.stringify({ date: selectedDate, content: draftContent }),
      });
      upsertReportInState(updated);
      setIsEditing(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to send report.';
      setActionError(message);
    } finally {
      setSending(false);
    }
  }, [draftContent, isLocked, isEditing, canEditDate, selectedDate, upsertReportInState]);

  const calendarEvents = useMemo(() => {
    const reportEvents = reports.map((report) => ({
      id: report.id,
      title: STATUS_CONFIG[report.status].label,
      start: report.reportDate,
      allDay: true,
      backgroundColor: STATUS_CONFIG[report.status].eventBg,
      borderColor: STATUS_CONFIG[report.status].eventBorder,
      textColor: STATUS_CONFIG[report.status].eventText,
      extendedProps: { status: report.status, kind: 'report' },
    }));
    const selectedEvent = selectedDate
      ? [
          {
            id: 'selected-day',
            start: selectedDate,
            end: shiftDate(selectedDate, 1),
            allDay: true,
            display: 'background',
            backgroundColor: '#e0f2fe',
            overlap: false,
            extendedProps: { kind: 'selected' },
          },
        ]
      : [];
    return [...reportEvents, ...selectedEvent];
  }, [reports, selectedDate]);

  const eventContent = useCallback((arg: EventContentArg) => {
    const kind = arg.event.extendedProps?.kind as string | undefined;
    if (kind !== 'report') return null;
    const status = arg.event.extendedProps?.status as DailyReportStatus | undefined;
    if (!status) return null;
    const config = STATUS_CONFIG[status];
    return (
      <div className="flex items-center gap-2 rounded-full bg-white/90 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-[0.18em]">
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: config.eventBorder }}
        />
        <span style={{ color: config.eventText }}>{config.label}</span>
      </div>
    );
  }, []);

  const selectedLabel = useMemo(() => {
    const date = new Date(`${selectedDate}T00:00:00`);
    if (Number.isNaN(date.getTime())) return selectedDate;
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(date);
  }, [selectedDate]);

  const updatedLabel = useMemo(() => {
    if (!selectedReport?.updatedAt) return 'Not saved yet';
    const date = new Date(selectedReport.updatedAt);
    if (Number.isNaN(date.getTime())) return selectedReport.updatedAt;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }, [selectedReport?.updatedAt]);

  const submittedLabel = useMemo(() => {
    if (!selectedReport?.submittedAt) return 'Not submitted';
    const date = new Date(selectedReport.submittedAt);
    if (Number.isNaN(date.getTime())) return selectedReport.submittedAt;
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(date);
  }, [selectedReport?.submittedAt]);

  const statusNote = useMemo(() => {
    if (selectedStatus === 'accepted') return 'This report is accepted and locked.';
    if (!canEditDate) return 'Future reports cannot be edited yet.';
    if (selectedStatus === 'rejected') return 'Rejected. Update and resubmit when ready.';
    if (selectedStatus === 'in_review') return 'In review with your manager.';
    return 'Draft mode. Click edit to update.';
  }, [selectedStatus, canEditDate]);

  const handleStartEdit = useCallback(() => {
    if (isLocked) return;
    if (!canEditDate) {
      setActionError('Future reports cannot be edited yet.');
      return;
    }
    setIsEditing(true);
    setActionError('');
  }, [isLocked, canEditDate]);

  const handleCancelEdit = useCallback(() => {
    setDraftContent(selectedReport?.content ?? '');
    setIsEditing(false);
    setActionError('');
    setAttachmentError('');
  }, [selectedReport?.content]);

  const handleAttachClick = useCallback(() => {
    if (!canEdit) return;
    fileInputRef.current?.click();
  }, [canEdit]);

  const handleAttachmentChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file || !selectedDate || !canEdit) return;
      setUploadingAttachment(true);
      setAttachmentError('');
      try {
        const formData = new FormData();
        formData.append('file', file);
        const uploaded = await api<UploadAttachment>('/daily-reports/upload', {
          method: 'POST',
          body: formData,
        });
        const updated = await api<DailyReport>('/daily-reports/by-date', {
          method: 'PUT',
          body: JSON.stringify({
            date: selectedDate,
            content: draftContent,
            attachments: [uploaded],
          }),
        });
        upsertReportInState(updated);
        await loadAttachments(updated.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to upload attachment.';
        setAttachmentError(message);
      } finally {
        setUploadingAttachment(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [selectedDate, canEdit, draftContent, upsertReportInState, loadAttachments],
  );

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f4f8ff] via-[#eef2ff] to-white text-slate-900">
      <TopNav />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Daily reports</p>
          <h1 className="text-3xl font-semibold text-slate-900">Your month at a glance</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Pick a day, write a quick update, and track review status in one place.
          </p>
        </div>

        <div className="flex flex-col gap-6 lg:flex-row">
          <section className="space-y-4 lg:flex-[1.2]">
            <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Calendar</p>
                  <h2 className="text-2xl font-semibold text-slate-900">Monthly view</h2>
                </div>
                <div className="flex flex-wrap gap-2">
                  {STATUS_ORDER.map((status) => (
                    <span
                      key={status}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${STATUS_CONFIG[status].chip}`}
                    >
                      {STATUS_CONFIG[status].label}
                    </span>
                  ))}
                </div>
              </div>

              {reportsError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {reportsError}
                </div>
              ) : null}

              <div className="relative mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                {reportsLoading ? (
                  <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/70 backdrop-blur-sm">
                    <div className="h-10 w-10 animate-spin rounded-full border-2 border-slate-300 border-t-sky-500" />
                  </div>
                ) : null}
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                  height={620}
                  showNonCurrentDates
                  fixedWeekCount={false}
                  nowIndicator
                  events={calendarEvents}
                  eventContent={eventContent}
                  dateClick={handleDateClick}
                  eventClick={handleEventClick}
                  datesSet={handleDatesSet}
                />
              </div>
            </div>
          </section>

          <aside className="space-y-4 lg:flex-[0.9]">
            <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-5 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Selected day</p>
                  <h2 className="text-2xl font-semibold text-slate-900">{selectedLabel}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${statusConfig.chip}`}
                  >
                    {statusConfig.label}
                  </span>
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    disabled={isLocked || isEditing || !canEditDate}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Edit
                  </button>
                  {isEditing && !isLocked ? (
                    <button
                      type="button"
                      onClick={handleCancelEdit}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Last saved</div>
                  <div className="text-sm font-semibold text-slate-800">{updatedLabel}</div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Submitted at</div>
                  <div className="text-sm font-semibold text-slate-800">{submittedLabel}</div>
                </div>
              </div>

              <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {statusNote}
              </div>
              {selectedReport?.status === 'rejected' && selectedReport.reviewReason ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-rose-500">
                    Rejection reason
                  </div>
                  <div className="mt-2 whitespace-pre-wrap">{selectedReport.reviewReason}</div>
                </div>
              ) : null}

              <div className="mt-4">
                <label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Daily report
                </label>
                <textarea
                  value={draftContent}
                  onChange={(event) => setDraftContent(event.target.value)}
                  placeholder="Write a short update for the day..."
                  readOnly={!canEdit}
                  className={`mt-2 min-h-[220px] w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm text-slate-800 shadow-sm outline-none ring-1 ring-transparent focus:ring-slate-300 ${
                    canEdit ? 'bg-white' : 'bg-slate-50 text-slate-600'
                  }`}
                />
              </div>

              <div className="mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Attachments
                  </span>
                  <button
                    type="button"
                    onClick={handleAttachClick}
                    disabled={!canEdit || uploadingAttachment}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {uploadingAttachment ? 'Uploading...' : 'Attach file'}
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={handleAttachmentChange}
                  accept="image/*,application/pdf,application/zip,text/plain,text/csv"
                  className="hidden"
                />
                {attachmentError ? (
                  <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {attachmentError}
                  </div>
                ) : null}
                <div className="mt-2 space-y-2">
                  {attachmentsLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      Loading attachments...
                    </div>
                  ) : attachments.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                      No attachments yet.
                    </div>
                  ) : (
                    attachments.map((attachment) => (
                      <a
                        key={attachment.id}
                        href={attachment.fileUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 transition hover:bg-slate-50"
                      >
                        <span className="truncate">{attachment.fileName}</span>
                        <span className="text-xs text-slate-400">
                          {(attachment.fileSize / 1024).toFixed(1)} KB
                        </span>
                      </a>
                    ))
                  )}
                </div>
              </div>

              {actionError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {actionError}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!canEdit || saving || sending}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save draft'}
                </button>
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={!canEdit || saving || sending}
                  className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_40px_-24px_rgba(15,23,42,0.6)] transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? 'Submitting...' : 'Submit for review'}
                </button>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
