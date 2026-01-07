'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import FullCalendar from '@fullcalendar/react';
import { DateClickArg, DatesSetArg, EventClickArg } from '@fullcalendar/core';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import AdminShell from '../../../components/AdminShell';
import { api } from '../../../lib/api';
import { ClientUser } from '../../../lib/auth';
import { useAuth } from '../../../lib/useAuth';

type DailyReportStatus = 'draft' | 'in_review' | 'accepted' | 'rejected';

type DailyReport = {
  id: string;
  userId: string;
  reportDate: string;
  status: DailyReportStatus;
  content?: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt?: string | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
};

type DailyReportWithUser = DailyReport & {
  userName: string;
  userEmail: string;
  userAvatarUrl?: string | null;
  userRole?: string;
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

type ViewMode = 'day' | 'user';

const STATUS_CONFIG: Record<
  DailyReportStatus,
  { label: string; chip: string; border: string }
> = {
  draft: {
    label: 'Draft',
    chip: 'border border-slate-200 bg-slate-100 text-slate-700',
    border: '#94a3b8',
  },
  in_review: {
    label: 'In review',
    chip: 'border border-sky-200 bg-sky-100 text-sky-700',
    border: '#38bdf8',
  },
  accepted: {
    label: 'Accepted',
    chip: 'border border-emerald-200 bg-emerald-100 text-emerald-700',
    border: '#34d399',
  },
  rejected: {
    label: 'Rejected',
    chip: 'border border-rose-200 bg-rose-100 text-rose-700',
    border: '#fb7185',
  },
};

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

function startOfWeek(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  const day = parsed.getDay();
  const diff = (day + 6) % 7;
  parsed.setDate(parsed.getDate() - diff);
  return toDateKey(parsed);
}

function formatDateLabel(value: string, options?: Intl.DateTimeFormatOptions) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', options ?? {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatWeekRangeLabel(start: string) {
  const end = shiftDate(start, 6);
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return `${start} - ${end}`;
  }
  const startLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(startDate);
  const endLabel = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(endDate);
  return `${startLabel} - ${endLabel}`;
}

function initialsFor(name?: string | null) {
  if (!name) return 'U';
  return name
    .split(' ')
    .map((part) => part.trim()[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

export default function AdminReportsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [selectedDate, setSelectedDate] = useState(() => toDateKey(new Date()));
  const [dateReports, setDateReports] = useState<DailyReportWithUser[]>([]);
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState('');
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState('');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(toDateKey(new Date())));
  const [userReports, setUserReports] = useState<DailyReport[]>([]);
  const [userLoading, setUserLoading] = useState(false);
  const [userError, setUserError] = useState('');
  const [modalReport, setModalReport] = useState<DailyReportWithUser | null>(null);
  const [modalAttachments, setModalAttachments] = useState<DailyReportAttachment[]>([]);
  const [attachmentsLoading, setAttachmentsLoading] = useState(false);
  const [attachmentsError, setAttachmentsError] = useState('');
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewError, setReviewError] = useState('');

  const isReviewer = user?.role === 'ADMIN' || user?.role === 'MANAGER';

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
      return;
    }
    if (!isReviewer) {
      router.replace('/workspace');
    }
  }, [loading, user, token, isReviewer, router]);

  const selectedUser = useMemo(
    () => users.find((entry) => entry.id === selectedUserId),
    [users, selectedUserId],
  );

  const visibleDateReports = useMemo(
    () => dateReports.filter((report) => report.status !== 'draft'),
    [dateReports],
  );

  const weekDates = useMemo(() => {
    return Array.from({ length: 7 }, (_, idx) => shiftDate(weekStart, idx));
  }, [weekStart]);

  const weekReportMap = useMemo(() => {
    const map = new Map<string, DailyReport>();
    userReports
      .filter((report) => report.status !== 'draft')
      .forEach((report) => {
        map.set(report.reportDate, report);
      });
    return map;
  }, [userReports]);

  const selectedDateLabel = useMemo(() => {
    return formatDateLabel(selectedDate, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [selectedDate]);

  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const list = await api<ClientUser[]>('/users');
      const filtered = Array.isArray(list) ? list : [];
      setUsers(filtered);
      setSelectedUserId((prev) => prev || filtered[0]?.id || '');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load users.';
      setUsersError(message);
    } finally {
      setUsersLoading(false);
    }
  }, []);

  const fetchReportsByDate = useCallback(async (date: string) => {
    setDateLoading(true);
    setDateError('');
    try {
      const data = await api<DailyReportWithUser[]>(
        `/admin/daily-reports/by-date?date=${encodeURIComponent(date)}`,
      );
      setDateReports(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load reports.';
      setDateError(message);
    } finally {
      setDateLoading(false);
    }
  }, []);

  const fetchReportsByUser = useCallback(
    async (userId: string, start: string) => {
      setUserLoading(true);
      setUserError('');
      try {
        const end = shiftDate(start, 6);
        const params = new URLSearchParams({ userId, start, end });
        const data = await api<DailyReport[]>(`/admin/daily-reports/by-user?${params.toString()}`);
        setUserReports(Array.isArray(data) ? data : []);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to load reports.';
        setUserError(message);
      } finally {
        setUserLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (!token || !isReviewer) return;
    void fetchUsers();
  }, [token, isReviewer, fetchUsers]);

  useEffect(() => {
    if (!token || !isReviewer) return;
    if (viewMode !== 'day') return;
    void fetchReportsByDate(selectedDate);
  }, [token, isReviewer, viewMode, selectedDate, fetchReportsByDate]);

  useEffect(() => {
    if (!token || !isReviewer) return;
    if (viewMode !== 'user') return;
    if (!selectedUserId) return;
    void fetchReportsByUser(selectedUserId, weekStart);
  }, [token, isReviewer, viewMode, selectedUserId, weekStart, fetchReportsByUser]);

  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const dateKey = normalizeDateKey(info.startStr);
    setSelectedDate((prev) => (prev ? prev : dateKey));
  }, []);

  const handleDateClick = useCallback((info: DateClickArg) => {
    setSelectedDate(normalizeDateKey(info.dateStr));
  }, []);

  const handleEventClick = useCallback((info: EventClickArg) => {
    if (!info.event.start) return;
    setSelectedDate(toDateKey(info.event.start));
  }, []);

  const openModalForReport = useCallback(
    (report: DailyReport, withUser?: ClientUser | null) => {
      const next: DailyReportWithUser = {
        ...report,
        userName: withUser?.name ?? (report as DailyReportWithUser).userName ?? 'Unknown',
        userEmail: withUser?.email ?? (report as DailyReportWithUser).userEmail ?? '',
        userRole: withUser?.role ?? (report as DailyReportWithUser).userRole,
        userAvatarUrl: withUser?.avatarUrl ?? (report as DailyReportWithUser).userAvatarUrl,
      };
      setModalReport(next);
      setModalAttachments([]);
      setReviewError('');
      setAttachmentsError('');
    },
    [],
  );

  const closeModal = useCallback(() => {
    setModalReport(null);
    setModalAttachments([]);
    setAttachmentsError('');
    setReviewError('');
  }, []);

  const applyUpdatedReport = useCallback((updated: DailyReport) => {
    setDateReports((prev) =>
      prev.map((report) => (report.id === updated.id ? { ...report, ...updated } : report)),
    );
    setUserReports((prev) =>
      prev.map((report) => (report.id === updated.id ? { ...report, ...updated } : report)),
    );
    setModalReport((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }, []);

  const handleReview = useCallback(
    async (status: 'accepted' | 'rejected') => {
      if (!modalReport) return;
      setReviewLoading(true);
      setReviewError('');
      try {
        const updated = await api<DailyReport>(`/daily-reports/${modalReport.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status }),
        });
        applyUpdatedReport(updated);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to update report.';
        setReviewError(message);
      } finally {
        setReviewLoading(false);
      }
    },
    [modalReport, applyUpdatedReport],
  );

  const modalCanReview = modalReport?.status === 'in_review';

  const loadModalAttachments = useCallback(async (reportId: string) => {
    setAttachmentsLoading(true);
    setAttachmentsError('');
    try {
      const data = await api<DailyReportAttachment[]>(`/daily-reports/${reportId}/attachments`);
      setModalAttachments(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to load attachments.';
      setAttachmentsError(message);
      setModalAttachments([]);
    } finally {
      setAttachmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!modalReport?.id) {
      setModalAttachments([]);
      return;
    }
    void loadModalAttachments(modalReport.id);
  }, [modalReport?.id, loadModalAttachments]);

  const calendarEvents = useMemo(() => {
    if (!selectedDate) return [];
    return [
      {
        id: 'selected-day',
        start: selectedDate,
        end: shiftDate(selectedDate, 1),
        allDay: true,
        display: 'background',
        backgroundColor: '#e2e8f0',
        overlap: false,
      },
    ];
  }, [selectedDate]);

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Admin review</p>
            <h1 className="text-3xl font-semibold text-slate-900">Daily report inbox</h1>
            <p className="text-sm text-slate-600">
              Review reports by day or scan weekly progress for a specific user.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs uppercase tracking-[0.2em] text-slate-500">View mode</label>
            <select
              value={viewMode}
              onChange={(event) => setViewMode(event.target.value as ViewMode)}
              className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-800 outline-none ring-1 ring-transparent focus:ring-slate-300"
            >
              <option value="day">By day</option>
              <option value="user">By user</option>
            </select>
          </div>
        </div>

        {viewMode === 'day' ? (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Calendar</p>
                  <h2 className="text-2xl font-semibold text-slate-900">Monthly view</h2>
                </div>
                <div className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-600">
                  {selectedDateLabel}
                </div>
              </div>
              <div className="mt-4 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <FullCalendar
                  plugins={[dayGridPlugin, interactionPlugin]}
                  initialView="dayGridMonth"
                  headerToolbar={{ left: 'prev,next today', center: 'title', right: '' }}
                  height={560}
                  showNonCurrentDates
                  fixedWeekCount={false}
                  nowIndicator
                  events={calendarEvents}
                  dateClick={handleDateClick}
                  eventClick={handleEventClick}
                  datesSet={handleDatesSet}
                />
              </div>
            </section>

            <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Reports</p>
                  <h2 className="text-2xl font-semibold text-slate-900">{selectedDateLabel}</h2>
                </div>
                <div className="text-xs text-slate-500">
                  {visibleDateReports.length} report{visibleDateReports.length === 1 ? '' : 's'}
                </div>
              </div>

              {dateError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {dateError}
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {dateLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    Loading reports...
                  </div>
                ) : visibleDateReports.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    No reports submitted for this day.
                  </div>
                ) : (
                  visibleDateReports.map((report) => (
                    <button
                      key={report.id}
                      type="button"
                      onClick={() => openModalForReport(report)}
                      className="w-full rounded-2xl border border-slate-200 bg-white px-3 py-3 text-left shadow-sm transition hover:border-slate-300 hover:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{report.userName}</div>
                          <div className="text-xs text-slate-600">{report.userEmail}</div>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${STATUS_CONFIG[report.status].chip}`}
                        >
                          {STATUS_CONFIG[report.status].label}
                        </span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </aside>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[0.7fr_1.3fr]">
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Users</p>
                  <h2 className="text-2xl font-semibold text-slate-900">All active members</h2>
                </div>
                <div className="text-xs text-slate-500">
                  {users.length} user{users.length === 1 ? '' : 's'}
                </div>
              </div>

              {usersError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {usersError}
                </div>
              ) : null}

              <div className="mt-4 space-y-2">
                {usersLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    Loading users...
                  </div>
                ) : users.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    No users available.
                  </div>
                ) : (
                  users.map((member) => {
                    const active = member.id === selectedUserId;
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => setSelectedUserId(member.id)}
                        className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-3 text-left transition ${
                          active
                            ? 'border-slate-300 bg-slate-100'
                            : 'border-slate-200 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                          {initialsFor(member.name)}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-slate-900">{member.name}</div>
                          <div className="text-xs text-slate-600">{member.email}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </section>

            <aside className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Weekly report</p>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    {selectedUser?.name ?? 'Select a user'}
                  </h2>
                  <p className="text-sm text-slate-600">{formatWeekRangeLabel(weekStart)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setWeekStart((prev) => shiftDate(prev, -7))}
                    className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Prev week
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekStart(startOfWeek(toDateKey(new Date())))}
                    className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    This week
                  </button>
                  <button
                    type="button"
                    onClick={() => setWeekStart((prev) => shiftDate(prev, 7))}
                    className="rounded-full border border-slate-200 px-3 py-2 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Next week
                  </button>
                </div>
              </div>

              {userError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {userError}
                </div>
              ) : null}

              <div className="mt-4 space-y-3">
                {userLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                    Loading weekly reports...
                  </div>
                ) : weekDates.length === 0 ? null : (
                  weekDates.map((dateKey) => {
                    const report = weekReportMap.get(dateKey);
                    return (
                      <button
                        key={dateKey}
                        type="button"
                        onClick={() =>
                          report ? openModalForReport(report, selectedUser) : undefined
                        }
                        disabled={!report}
                        className={`w-full rounded-2xl border px-3 py-3 text-left transition ${
                          report
                            ? 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                            : 'border-dashed border-slate-200 bg-slate-50 text-slate-500'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold text-slate-900">
                              {formatDateLabel(dateKey, { weekday: 'long', month: 'short', day: 'numeric' })}
                            </div>
                          </div>
                          {report ? (
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${STATUS_CONFIG[report.status].chip}`}
                            >
                              {STATUS_CONFIG[report.status].label}
                            </span>
                          ) : (
                            <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">
                              No submitted
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </aside>
          </div>
        )}
      </div>

      {modalReport ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-10">
          <div className="absolute inset-0 bg-slate-900/40" onClick={closeModal} />
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Report</p>
                <h3 className="text-2xl font-semibold text-slate-900">
                  {formatDateLabel(modalReport.reportDate, {
                    weekday: 'long',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </h3>
                <div className="mt-2 text-sm text-slate-600">
                  {modalReport.userName} - {modalReport.userEmail || 'No email'}
                </div>
              </div>
              <span
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${STATUS_CONFIG[modalReport.status].chip}`}
              >
                {STATUS_CONFIG[modalReport.status].label}
              </span>
            </div>

            <div className="mt-4 max-h-[320px] overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700 whitespace-pre-wrap">
              {modalReport.content?.trim() || 'No report content.'}
            </div>

            <div className="mt-4">
              <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Attachments</div>
              {attachmentsError ? (
                <div className="mt-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  {attachmentsError}
                </div>
              ) : null}
              <div className="mt-2 space-y-2">
                {attachmentsLoading ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                    Loading attachments...
                  </div>
                ) : modalAttachments.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    No attachments.
                  </div>
                ) : (
                  modalAttachments.map((attachment) => (
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

            {reviewError ? (
              <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {reviewError}
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                Status: {STATUS_CONFIG[modalReport.status].label}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={() => handleReview('rejected')}
                  disabled={!modalCanReview || reviewLoading}
                  className="rounded-full border border-rose-200 bg-rose-50 px-4 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reviewLoading ? 'Updating...' : 'Reject'}
                </button>
                <button
                  type="button"
                  onClick={() => handleReview('accepted')}
                  disabled={!modalCanReview || reviewLoading}
                  className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {reviewLoading ? 'Updating...' : 'Accept'}
                </button>
              </div>
            </div>
            {!modalCanReview ? (
              <div className="mt-3 text-xs text-slate-500">
                Only in-review reports can be reviewed.
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}
