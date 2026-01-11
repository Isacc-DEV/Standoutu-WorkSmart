'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import TopNav from '../../components/TopNav';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { ClientUser } from '../../lib/auth';

type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type TaskApprovalStatus = 'pending' | 'approved' | 'rejected';

type TaskAssignee = {
  id: string;
  name: string;
  email?: string | null;
  avatarUrl?: string | null;
};

type Task = {
  id: string;
  title: string;
  summary?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  approvalStatus?: TaskApprovalStatus;
  dueDate: string | null;
  assignees: TaskAssignee[];
  project?: string | null;
  tags: string[];
  notes?: string | null;
  href?: string | null;
  createdBy?: string | null;
  rejectionReason?: string | null;
};

const STATUS_STYLES: Record<TaskStatus, { label: string; chip: string; dot: string }> = {
  todo: {
    label: 'To do',
    chip: 'border border-amber-200 bg-amber-50 text-amber-700',
    dot: 'bg-amber-500',
  },
  in_progress: {
    label: 'In progress',
    chip: 'border border-sky-200 bg-sky-50 text-sky-700',
    dot: 'bg-sky-500',
  },
  in_review: {
    label: 'In review',
    chip: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
    dot: 'bg-emerald-500',
  },
  done: {
    label: 'Done',
    chip: 'border border-slate-200 bg-slate-100 text-slate-700',
    dot: 'bg-slate-900',
  },
};

const PRIORITY_STYLES: Record<TaskPriority, { label: string; chip: string }> = {
  low: {
    label: 'Low',
    chip: 'border border-slate-200 bg-white text-slate-600',
  },
  medium: {
    label: 'Medium',
    chip: 'border border-amber-200 bg-amber-50 text-amber-700',
  },
  high: {
    label: 'High',
    chip: 'border border-orange-200 bg-orange-50 text-orange-700',
  },
  urgent: {
    label: 'Urgent',
    chip: 'border border-rose-200 bg-rose-100 text-rose-700',
  },
};

const APPROVAL_STYLES: Record<TaskApprovalStatus, { label: string; chip: string }> = {
  pending: {
    label: 'Awaiting approval',
    chip: 'border border-amber-200 bg-amber-50 text-amber-700',
  },
  approved: {
    label: 'Approved',
    chip: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  rejected: {
    label: 'Rejected',
    chip: 'border border-rose-200 bg-rose-50 text-rose-700',
  },
};

const PRIORITY_ORDER: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const DEFAULT_TASK_DRAFT = {
  title: '',
  summary: '',
  priority: 'medium' as TaskPriority,
  dueDate: '',
  project: '',
  tags: '',
  notes: '',
  href: '',
  assigneeIds: [] as string[],
};

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function toDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseDateKey(value?: string | null) {
  if (!value) return new Date(NaN);
  return new Date(`${value}T00:00:00`);
}

function startOfWeek(value: Date) {
  const dayIndex = value.getDay();
  const offset = (dayIndex + 6) % 7;
  const start = new Date(value);
  start.setDate(value.getDate() - offset);
  return startOfDay(start);
}

function endOfWeek(value: Date) {
  const start = startOfWeek(value);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return startOfDay(end);
}

function formatShortDate(value?: string | null) {
  if (!value) return 'none set';
  const date = parseDateKey(value);
  if (Number.isNaN(date.getTime())) return 'none set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function diffInDays(from: Date, to: Date) {
  const fromDay = startOfDay(from).getTime();
  const toDay = startOfDay(to).getTime();
  return Math.round((toDay - fromDay) / (1000 * 60 * 60 * 24));
}

function formatDueLabel(task: Task, today: Date) {
  const dueDate = parseDateKey(task.dueDate);
  if (Number.isNaN(dueDate.getTime())) return 'none set';
  const diff = diffInDays(today, dueDate);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'today';
  const weekStart = startOfWeek(today);
  const weekEnd = endOfWeek(today);
  if (dueDate >= weekStart && dueDate <= weekEnd) {
    return 'this week';
  }
  if (
    dueDate.getFullYear() === today.getFullYear() &&
    dueDate.getMonth() === today.getMonth()
  ) {
    return 'this month';
  }
  return formatShortDate(task.dueDate);
}

function buildDeadlineBadge(task: Task, today: Date) {
  const label = formatDueLabel(task, today);
  if (label === 'overdue') {
    return { label, chip: 'border border-rose-200 bg-rose-50 text-rose-700' };
  }
  if (label === 'today') {
    return { label, chip: 'border border-rose-200 bg-rose-50 text-rose-700' };
  }
  if (label === 'this week') {
    return { label, chip: 'border border-amber-200 bg-amber-50 text-amber-700' };
  }
  if (label === 'this month') {
    return { label, chip: 'border border-teal-200 bg-teal-50 text-teal-700' };
  }
  if (label.startsWith('in ')) {
    return { label, chip: 'border border-sky-200 bg-sky-50 text-sky-700' };
  }
  return { label, chip: 'border border-slate-200 bg-white text-slate-600' };
}

function formatAssignees(assignees: TaskAssignee[]) {
  const cleaned = assignees
    .map((assignee) => {
      const name = assignee.name?.trim();
      const email = assignee.email?.trim();
      return name || email || '';
    })
    .filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : 'Unassigned';
}

type NoteEntry = {
  author: string;
  timestamp: string;
  text: string;
};

function parseTaskNotes(notes?: string | null): NoteEntry[] {
  if (!notes) return [];
  return notes
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const match = line.match(/^-\s*(.+?)\s*-\s*([^:]+):\s*(.+)$/);
      if (match) {
        return {
          timestamp: match[1].trim(),
          author: match[2].trim(),
          text: match[3].trim(),
        };
      }
      return { timestamp: '', author: '', text: line };
    });
}

function getInitials(name: string) {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || '?';
}


function StatCard({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: 'slate' | 'amber' | 'rose' | 'emerald';
}) {
  const tones: Record<typeof tone, string> = {
    slate: 'border-slate-200 bg-white text-slate-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    rose: 'border-rose-200 bg-rose-50 text-rose-900',
    emerald: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={`rounded-2xl border px-4 py-3 shadow-sm ${tones[tone]}`}>
      <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{helper}</div>
    </div>
  );
}

export default function TasksPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | TaskStatus>('all');
  const [priorityFilter, setPriorityFilter] = useState<'all' | TaskPriority>('all');
  const [sortKey, setSortKey] = useState<'due' | 'priority'>('due');
  const [showDone, setShowDone] = useState(true);
  const [showAssignedToMe, setShowAssignedToMe] = useState(false);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({ ...DEFAULT_TASK_DRAFT });
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');
  const [createSaving, setCreateSaving] = useState(false);
  const [requestAssigneeIds, setRequestAssigneeIds] = useState<string[]>([]);
  const [requestSaving, setRequestSaving] = useState(false);
  const [requestError, setRequestError] = useState('');
  const [requestSuccess, setRequestSuccess] = useState('');
  const [assignDraftIds, setAssignDraftIds] = useState<string[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignSuccess, setAssignSuccess] = useState('');
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selfAssignSaving, setSelfAssignSaving] = useState(false);
  const [selfAssignError, setSelfAssignError] = useState('');
  const [selfAssignSuccess, setSelfAssignSuccess] = useState('');
  const [adminEditOpen, setAdminEditOpen] = useState(false);
  const [adminEditDraft, setAdminEditDraft] = useState({
    dueDate: '',
    summary: '',
    notes: '',
  });
  const [adminEditSaving, setAdminEditSaving] = useState(false);
  const [adminEditError, setAdminEditError] = useState('');
  const [adminEditSuccess, setAdminEditSuccess] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState('');
  const [noteSuccess, setNoteSuccess] = useState('');
  const [doneSaving, setDoneSaving] = useState(false);
  const [doneError, setDoneError] = useState('');
  const [doneSuccess, setDoneSuccess] = useState('');
  const isAdmin = user?.role === 'ADMIN';
  const isManager = user?.role === 'MANAGER';
  const canCreate = isAdmin || isManager;

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
    }
  }, [loading, user, token, router]);

  const loadTasks = useCallback(async () => {
    if (!token) return;
    setTasksLoading(true);
    setTasksError('');
    try {
      const data = await api<Task[]>('/tasks', undefined, token);
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load tasks.';
      setTasksError(message);
      setTasks([]);
    } finally {
      setTasksLoading(false);
    }
  }, [token]);

  const loadUsers = useCallback(async () => {
    if (!token || !canCreate) return;
    setUsersLoading(true);
    setUsersError('');
    try {
      const data = await api<ClientUser[]>('/users', undefined, token);
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load users.';
      setUsersError(message);
      setUsers([]);
    } finally {
      setUsersLoading(false);
    }
  }, [token, canCreate]);

  useEffect(() => {
    if (loading || !user || !token) return;
    void loadTasks();
  }, [loading, user, token, loadTasks]);

  useEffect(() => {
    if (loading || !user || !token) return;
    void loadUsers();
  }, [loading, user, token, loadUsers]);

  const toggleSelection = (
    setValue: (value: string[] | ((prev: string[]) => string[])) => void,
    id: string,
  ) => {
    setValue((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
  };

  const openTaskModal = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    setTaskModalOpen(false);
    setSelectedTaskId('');
    setAssignModalOpen(false);
    setAdminEditOpen(false);
  };

  const handleCreateTask = async () => {
    if (!token || !canCreate) return;
    setCreateError('');
    setCreateSuccess('');
    const title = createDraft.title.trim();
    if (!title) {
      setCreateError('Task title is required.');
      return;
    }
    const dueDate = createDraft.dueDate || null;
    const payload = {
      title,
      summary: createDraft.summary.trim() || null,
      status: 'todo' as TaskStatus,
      priority: createDraft.priority,
      dueDate,
      project: createDraft.project.trim() || null,
      notes: createDraft.notes.trim() || null,
      tags: createDraft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean),
      href: createDraft.href.trim() || null,
      assigneeIds: createDraft.assigneeIds,
    };
    setCreateSaving(true);
    try {
      await api('/tasks', { method: 'POST', body: JSON.stringify(payload) }, token);
      setCreateSuccess(
        isAdmin ? 'Task created and assigned.' : 'Task request sent for approval.',
      );
      setCreateDraft({ ...DEFAULT_TASK_DRAFT });
      setCreateOpen(false);
      await loadTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to create task.';
      setCreateError(message);
    } finally {
      setCreateSaving(false);
    }
  };

  const handleRequestAssignees = async () => {
    if (!token || !focusedTask) return;
    setRequestError('');
    setRequestSuccess('');
    if (!requestAssigneeIds.length) {
      setRequestError('Pick at least one assignee to request.');
      return;
    }
    setRequestSaving(true);
    try {
      await api(
        `/tasks/${focusedTask.id}/assign-requests`,
        { method: 'POST', body: JSON.stringify({ assigneeIds: requestAssigneeIds }) },
        token,
      );
      setRequestSuccess('Assignment request sent to admin.');
      setRequestAssigneeIds([]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to request assignments.';
      setRequestError(message);
    } finally {
      setRequestSaving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!token || !focusedTask || !canActOnTask) return;
    setNoteError('');
    setNoteSuccess('');
    const notes = noteDraft.trim();
    if (!notes) {
      setNoteError('Note is required.');
      return;
    }
    setNoteSaving(true);
    try {
      await api(
        `/tasks/${focusedTask.id}/notes`,
        { method: 'PATCH', body: JSON.stringify({ note: notes }) },
        token,
      );
      setNoteSuccess('Note added.');
      setNoteDraft('');
      await loadTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to save note.';
      setNoteError(message);
    } finally {
      setNoteSaving(false);
    }
  };

  const handleDoneRequest = async () => {
    if (!token || !focusedTask || !canActOnTask) return;
    setDoneSaving(true);
    setDoneError('');
    setDoneSuccess('');
    try {
      await api(`/tasks/${focusedTask.id}/done-requests`, { method: 'POST' }, token);
      setDoneSuccess('Done request sent to admin.');
      await loadTasks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to request completion.';
      setDoneError(message);
    } finally {
      setDoneSaving(false);
    }
  };

  const handleRequestAssign = async () => {
    if (!token || !focusedTask || readOnly || isAdmin) return;
    setSelfAssignSaving(true);
    setSelfAssignError('');
    setSelfAssignSuccess('');
    try {
      await api(`/tasks/${focusedTask.id}/assign-self-request`, { method: 'POST' }, token);
      setSelfAssignSuccess('Assignment request sent to admin.');
      await loadTasks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to request assignment.';
      setSelfAssignError(message);
    } finally {
      setSelfAssignSaving(false);
    }
  };

  const handleAssignToMe = async () => {
    if (!token || !focusedTask || readOnly || isAdmin) return;
    setSelfAssignSaving(true);
    setSelfAssignError('');
    setSelfAssignSuccess('');
    try {
      await api(`/tasks/${focusedTask.id}/assign-self`, { method: 'POST' }, token);
      setSelfAssignSuccess('You are now assigned.');
      await loadTasks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to assign to you.';
      setSelfAssignError(message);
    } finally {
      setSelfAssignSaving(false);
    }
  };

  const toggleDraftAssignee = (userId: string) => {
    setCreateDraft((prev) => ({
      ...prev,
      assigneeIds: prev.assigneeIds.includes(userId)
        ? prev.assigneeIds.filter((id) => id !== userId)
        : [...prev.assigneeIds, userId],
    }));
  };

  const toggleAssignDraft = (userId: string) => {
    setAssignDraftIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  };

  const handleAssignUsers = async () => {
    if (!token || !focusedTask || !isAdmin) return;
    setAssignSaving(true);
    setAssignError('');
    setAssignSuccess('');
    try {
      await api(
        `/tasks/${focusedTask.id}`,
        { method: 'PATCH', body: JSON.stringify({ assigneeIds: assignDraftIds }) },
        token,
      );
      setAssignSuccess('Assignments updated.');
      await loadTasks();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unable to update assignments.';
      setAssignError(message);
    } finally {
      setAssignSaving(false);
    }
  };

  const openAssignModal = () => {
    if (!isAdmin) return;
    setAssignError('');
    setAssignSuccess('');
    setAssignModalOpen(true);
  };

  const closeAssignModal = () => {
    setAssignModalOpen(false);
  };

  const startAdminEdit = () => {
    if (!isAdmin || !focusedTask) return;
    setAdminEditDraft({
      dueDate: focusedTask.dueDate ?? '',
      summary: focusedTask.summary?.trim() ?? '',
      notes: focusedTask.notes ?? '',
    });
    setAdminEditOpen(true);
    setAdminEditError('');
    setAdminEditSuccess('');
  };

  const cancelAdminEdit = () => {
    setAdminEditOpen(false);
    if (focusedTask) {
      setAdminEditDraft({
        dueDate: focusedTask.dueDate ?? '',
        summary: focusedTask.summary?.trim() ?? '',
        notes: focusedTask.notes ?? '',
      });
    }
    setAdminEditError('');
    setAdminEditSuccess('');
  };

  const handleAdminEditSave = async () => {
    if (!token || !focusedTask || !isAdmin) return;
    setAdminEditSaving(true);
    setAdminEditError('');
    setAdminEditSuccess('');
    try {
      const payload = {
        dueDate: adminEditDraft.dueDate.trim() || null,
        summary: adminEditDraft.summary.trim() || null,
        notes: adminEditDraft.notes.trim() || null,
      };
      await api(
        `/tasks/${focusedTask.id}`,
        { method: 'PATCH', body: JSON.stringify(payload) },
        token,
      );
      setAdminEditSuccess('Task updated.');
      setAdminEditOpen(false);
      await loadTasks();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to update task.';
      setAdminEditError(message);
    } finally {
      setAdminEditSaving(false);
    }
  };

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const userId = user?.id ?? '';
    return tasks.filter((task) => {
      if (statusFilter !== 'all' && task.status !== statusFilter) return false;
      if (priorityFilter !== 'all' && task.priority !== priorityFilter) return false;
      if (!showDone && task.status === 'done') return false;
      if (showAssignedToMe) {
        if (!userId) return false;
        const isAssigned = task.assignees.some((assignee) => assignee.id === userId);
        if (!isAssigned) return false;
      }
      if (!query) return true;
      const assigneeText = task.assignees
        .map((assignee) => `${assignee.name ?? ''} ${assignee.email ?? ''}`.trim())
        .filter(Boolean)
        .join(' ');
      const target = [
        task.title,
        task.summary,
        assigneeText,
        task.project,
        task.tags.join(' '),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return target.includes(query);
    });
  }, [tasks, searchQuery, statusFilter, priorityFilter, showDone, showAssignedToMe, user?.id]);

  const sortedTasks = useMemo(() => {
    const sorted = [...filteredTasks];
    sorted.sort((a, b) => {
      if (sortKey === 'priority') {
        return (
          PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority)
        );
      }
      const aDue = a.dueDate ?? '9999-12-31';
      const bDue = b.dueDate ?? '9999-12-31';
      return aDue.localeCompare(bDue);
    });
    return sorted;
  }, [filteredTasks, sortKey]);

  useEffect(() => {
    if (!selectedTaskId) return;
    const current = sortedTasks.find((task) => task.id === selectedTaskId);
    if (!current) {
      setSelectedTaskId('');
      setTaskModalOpen(false);
    }
  }, [sortedTasks, selectedTaskId]);

  useEffect(() => {
    setRequestAssigneeIds([]);
    setRequestError('');
    setRequestSuccess('');
  }, [selectedTaskId]);

  const focusedTask = sortedTasks.find((task) => task.id === selectedTaskId) ?? null;
  const noteEntries = useMemo(
    () => parseTaskNotes(focusedTask?.notes),
    [focusedTask?.notes],
  );
  const canRequestAssignees =
    isManager && focusedTask?.createdBy === user?.id;
  const assignedAssigneeIds = new Set(
    focusedTask?.assignees.map((assignee) => assignee.id) ?? [],
  );
  const isAssignedToUser = Boolean(
    focusedTask?.assignees.some((assignee) => assignee.id === user?.id),
  );
  const today = new Date();
  const todayKey = toDateKey(today);
  const openCount = tasks.filter((task) => task.status !== 'done').length;
  const doneCount = tasks.filter((task) => task.status === 'done').length;
  const dueTodayCount = tasks.filter((task) => task.dueDate === todayKey).length;
  const overdueCount = tasks.filter((task) => {
    if (task.status === 'done') return false;
    if (!task.dueDate) return false;
    return task.dueDate < todayKey;
  }).length;
  const readOnly = user?.role === 'OBSERVER';
  const canActOnTask = !readOnly && isAssignedToUser;

  useEffect(() => {
    if (!focusedTask) {
      setNoteDraft('');
      setNoteOpen(false);
      setNoteError('');
      setNoteSuccess('');
      setDoneError('');
      setDoneSuccess('');
      setAssignDraftIds([]);
      setAssignError('');
      setAssignSuccess('');
      setSelfAssignError('');
      setSelfAssignSuccess('');
      setAdminEditOpen(false);
      setAdminEditDraft({ dueDate: '', summary: '', notes: '' });
      setAdminEditError('');
      setAdminEditSuccess('');
      setAssignModalOpen(false);
      return;
    }
    setNoteDraft('');
    setNoteOpen(false);
    setNoteError('');
    setNoteSuccess('');
    setDoneError('');
    setDoneSuccess('');
    setAssignDraftIds(focusedTask.assignees.map((assignee) => assignee.id));
    setAssignError('');
    setAssignSuccess('');
    setSelfAssignError('');
    setSelfAssignSuccess('');
    setAdminEditOpen(false);
    setAdminEditDraft({
      dueDate: focusedTask.dueDate ?? '',
      summary: focusedTask.summary?.trim() ?? '',
      notes: focusedTask.notes ?? '',
    });
    setAdminEditError('');
    setAdminEditSuccess('');
    setAssignModalOpen(false);
  }, [focusedTask]);

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-b from-[#f4f8ff] via-[#eef2ff] to-white text-slate-900">
        <TopNav />
        <div className="mx-auto max-w-4xl px-6 py-12">
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-sm text-slate-600 shadow-sm">
            Loading tasks...
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#f4f8ff] via-[#eef2ff] to-white text-slate-900">
      <TopNav />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-6 py-8">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Tasks</p>
          <h1 className="text-3xl font-semibold text-slate-900">Task command center</h1>
          <p className="max-w-2xl text-sm text-slate-600">
            Track onboarding, review queues, and follow-ups across your active profiles.
          </p>
        </div>

        <section className="lg:sticky lg:top-0 lg:z-20 lg:-mx-6 lg:border-b lg:border-slate-200/70 lg:bg-white lg:px-6 lg:pb-4 lg:pt-3 lg:shadow-[0_18px_45px_-35px_rgba(15,23,42,0.35)]">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Open tasks" value={String(openCount)} helper="Need action" tone="slate" />
            <StatCard label="Due today" value={String(dueTodayCount)} helper="Priority focus" tone="amber" />
            <StatCard label="Overdue" value={String(overdueCount)} helper="Requires follow-up" tone="rose" />
            <StatCard label="Completed" value={String(doneCount)} helper="Closed this cycle" tone="emerald" />
          </div>
        </section>

        {tasksError ? (
          <div className="rounded-3xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {tasksError}
          </div>
        ) : null}

        <div className="flex flex-col gap-6 lg:flex-row">
          <aside className="lg:w-72 xl:w-80">
            <div className="rounded-3xl border border-slate-200/70 bg-white/90 p-4 shadow-[0_18px_60px_-50px_rgba(15,23,42,0.4)] lg:sticky lg:top-32">
              <div className="text-xs uppercase tracking-[0.22em] text-slate-500">Filters</div>
              <div className="mt-4 space-y-4">
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Search</span>
                  <input
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                    placeholder="Search by task, assignee, project, or tag..."
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                  />
                </label>
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Visibility
                  </div>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={showDone}
                      onChange={(event) => setShowDone(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                    />
                    <span>Show done</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={showAssignedToMe}
                      onChange={(event) => setShowAssignedToMe(event.target.checked)}
                      className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                    />
                    <span>Show assigned to me</span>
                  </label>
                </div>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Status</span>
                  <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as 'all' | TaskStatus)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-1 ring-transparent focus:ring-slate-300"
                  >
                    <option value="all">All</option>
                    <option value="todo">To do</option>
                    <option value="in_progress">In progress</option>
                    <option value="in_review">In review</option>
                    <option value="done">Done</option>
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Priority</span>
                  <select
                    value={priorityFilter}
                    onChange={(event) =>
                      setPriorityFilter(event.target.value as 'all' | TaskPriority)
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none ring-1 ring-transparent focus:ring-slate-300"
                  >
                    <option value="all">All</option>
                    <option value="urgent">Urgent</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </label>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                <div>
                  Showing {sortedTasks.length} task{sortedTasks.length === 1 ? '' : 's'}
                  {sortedTasks.length !== tasks.length ? ` of ${tasks.length}` : ''}
                </div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
                  Today: {formatShortDate(todayKey)}
                </div>
              </div>
            </div>
          </aside>
          <section className="space-y-4 lg:flex-[1.2]">
            <div className="flex items-center gap-3">
              {canCreate ? (
                <button
                  type="button"
                  onClick={() =>
                    setCreateOpen((prev) => {
                      if (!prev) {
                        setCreateError('');
                        setCreateSuccess('');
                      }
                      return !prev;
                    })
                  }
                  className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 transition hover:text-slate-900"
                >
                  New task
                </button>
              ) : null}
              <div className="ml-auto flex flex-wrap items-center gap-3">
                <span className="inline-flex h-5 w-5 items-center justify-center text-slate-500">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M7 3v18" />
                    <path d="M3 7l4-4 4 4" />
                    <path d="M17 21V3" />
                    <path d="M13 17l4 4 4-4" />
                  </svg>
                </span>
                <span className="text-[11px] tracking-[0.18em] text-slate-500 normal-case">
                  by
                </span>
                <div className="relative">
                  <select
                    aria-label="Sort tasks"
                    value={sortKey}
                    onChange={(event) =>
                      setSortKey(event.target.value as 'due' | 'priority')
                    }
                    className="appearance-none rounded-full border border-slate-200 bg-transparent px-4 py-2 pr-9 text-xs font-semibold uppercase tracking-[0.18em] text-slate-700 outline-none ring-1 ring-transparent focus:ring-slate-300"
                  >
                    <option value="due">Due date</option>
                    <option value="priority">Priority</option>
                  </select>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </div>
              </div>
            </div>
            {canCreate && createOpen ? (
              <div className="space-y-4">
                {createError ? (
                  <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                    {createError}
                  </div>
                ) : null}
                {createSuccess ? (
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                    {createSuccess}
                  </div>
                ) : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Title
                    </span>
                    <input
                      value={createDraft.title}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, title: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Due date
                    </span>
                    <input
                      type="date"
                      value={createDraft.dueDate}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, dueDate: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Priority
                    </span>
                    <select
                      value={createDraft.priority}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({
                          ...prev,
                          priority: event.target.value as TaskPriority,
                        }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    >
                      <option value="low">Low</option>
                      <option value="medium">Medium</option>
                      <option value="high">High</option>
                      <option value="urgent">Urgent</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Project
                    </span>
                    <input
                      value={createDraft.project}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, project: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Tags
                    </span>
                    <input
                      value={createDraft.tags}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, tags: event.target.value }))
                      }
                      placeholder="client, onboarding"
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Summary
                    </span>
                    <textarea
                      rows={2}
                      value={createDraft.summary}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, summary: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Notes
                    </span>
                    <textarea
                      rows={2}
                      value={createDraft.notes}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, notes: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  </label>
                  <label className="space-y-1 md:col-span-2">
                    <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      Workspace link
                    </span>
                    <input
                      value={createDraft.href}
                      onChange={(event) =>
                        setCreateDraft((prev) => ({ ...prev, href: event.target.value }))
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  </label>
                </div>
                <div className="space-y-2">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Assignees
                  </div>
                  {usersLoading ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      Loading users...
                    </div>
                  ) : usersError ? (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                      {usersError}
                    </div>
                  ) : users.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                      No active users available.
                    </div>
                  ) : (
                    <div className="max-h-40 space-y-1 overflow-auto rounded-2xl border border-slate-200 bg-white/70 px-3 py-2">
                      {users.map((member) => (
                        <label key={member.id} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={createDraft.assigneeIds.includes(member.id)}
                            onChange={() => toggleDraftAssignee(member.id)}
                            className="h-4 w-4 rounded border-slate-300 accent-slate-900"
                          />
                          <span className="font-medium text-slate-800">{member.name}</span>
                          <span className="text-xs text-slate-500">{member.email}</span>
                        </label>
                      ))}
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    {isAdmin
                      ? 'Assignments apply immediately.'
                      : 'Assignments require admin approval.'}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCreateTask}
                    disabled={createSaving}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_12px_40px_-24px_rgba(15,23,42,0.6)] transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {createSaving ? 'Saving...' : isAdmin ? 'Create task' : 'Submit request'}
                  </button>
                </div>
              </div>
            ) : null}
            {tasksLoading ? (
              <div className="rounded-3xl border border-slate-200 bg-white/80 px-5 py-6 text-sm text-slate-600">
                Loading tasks...
              </div>
            ) : sortedTasks.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-slate-200 bg-white/80 px-5 py-6 text-sm text-slate-500">
                No tasks match this filter set.
              </div>
            ) : (
              sortedTasks.map((task) => {
                const status = STATUS_STYLES[task.status];
                const priority = PRIORITY_STYLES[task.priority];
                const approvalStatus = task.approvalStatus ?? 'approved';
                const approval = APPROVAL_STYLES[approvalStatus];
                const deadlineBadge = buildDeadlineBadge(task, today);
                const dueDiff = diffInDays(today, parseDateKey(task.dueDate));
                const dueDateLabel = formatShortDate(task.dueDate);
                const isSelected = task.id === focusedTask?.id;
                const summaryText = task.summary?.trim();
                const dueTone =
                  task.status === 'done'
                    ? 'text-slate-400'
                    : dueDiff < 0
                    ? 'text-rose-600'
                    : dueDiff <= 1
                    ? 'text-amber-600'
                    : 'text-slate-500';
                return (
                  <button
                    key={task.id}
                    type="button"
                    onClick={() => openTaskModal(task.id)}
                    className={`w-full rounded-3xl border px-5 py-4 text-left shadow-sm transition ${
                      isSelected
                        ? 'border-slate-300 bg-white shadow-[0_18px_60px_-45px_rgba(15,23,42,0.35)]'
                        : 'border-slate-200 bg-white/90 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${status.chip}`}
                          >
                            <span className={`h-2 w-2 rounded-full ${status.dot}`} />
                            {status.label}
                          </span>
                          {approvalStatus !== 'approved' ? (
                            <span
                              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${approval.chip}`}
                            >
                              {approval.label}
                            </span>
                          ) : null}
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${priority.chip}`}
                          >
                            {priority.label}
                          </span>
                          <span
                            className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${deadlineBadge.chip}`}
                          >
                            {deadlineBadge.label}
                          </span>
                        </div>
                        <div>
                          <div className="text-lg font-semibold text-slate-900">{task.title}</div>
                          <div className="text-sm text-slate-600">
                            {summaryText || 'No summary'}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 text-right">
                        <div className={`text-xs font-semibold uppercase tracking-[0.18em] ${dueTone}`}>
                          Due {dueDateLabel}
                        </div>
                        <div className="text-xs text-slate-500">
                          Assigned to: {formatAssignees(task.assignees)}
                        </div>
                        <div className="text-xs text-slate-500">
                          Project: {task.project ?? 'No project'}
                        </div>
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {task.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-500"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })
            )}
          </section>
        </div>
        {taskModalOpen && focusedTask ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/50 px-4 pb-12 pt-32 backdrop-blur-sm sm:pt-36"
            onClick={closeTaskModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-4xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    Task detail
                  </p>
                  <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                    {focusedTask.title}
                  </h2>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin ? (
                    adminEditOpen ? (
                      <>
                        <button
                          type="button"
                          onClick={handleAdminEditSave}
                          disabled={adminEditSaving}
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-60"
                        >
                          {adminEditSaving ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          type="button"
                          onClick={cancelAdminEdit}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={startAdminEdit}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
                      >
                        Edit
                      </button>
                    )
                  ) : null}
                  <button
                    type="button"
                    onClick={closeTaskModal}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
                  >
                    Close
                  </button>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    STATUS_STYLES[focusedTask.status].chip
                  }`}
                >
                  {STATUS_STYLES[focusedTask.status].label}
                </span>
                {focusedTask.approvalStatus && focusedTask.approvalStatus !== 'approved' ? (
                  <span
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                      APPROVAL_STYLES[focusedTask.approvalStatus].chip
                    }`}
                  >
                    {APPROVAL_STYLES[focusedTask.approvalStatus].label}
                  </span>
                ) : null}
                <span
                  className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ${
                    PRIORITY_STYLES[focusedTask.priority].chip
                  }`}
                >
                  {PRIORITY_STYLES[focusedTask.priority].label}
                </span>
              </div>
              {adminEditError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                  {adminEditError}
                </div>
              ) : null}
              {adminEditSuccess ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
                  {adminEditSuccess}
                </div>
              ) : null}

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={openAssignModal}
                  disabled={!isAdmin}
                  className={`rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4 text-left ${
                    isAdmin
                      ? 'cursor-pointer transition hover:border-slate-300'
                      : 'cursor-default'
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Assigned to
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatAssignees(focusedTask.assignees)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {focusedTask.project ?? 'No project'}
                  </div>
                </button>
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Due date
                  </div>
                  {isAdmin && adminEditOpen ? (
                    <input
                      type="date"
                      value={adminEditDraft.dueDate}
                      onChange={(event) =>
                        setAdminEditDraft((prev) => ({
                          ...prev,
                          dueDate: event.target.value,
                        }))
                      }
                      className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    />
                  ) : (
                    <div className="text-sm font-semibold text-slate-900">
                      {formatShortDate(focusedTask.dueDate)}
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    {isAdmin && adminEditOpen ? 'Pick a date from the calendar.' : formatDueLabel(focusedTask, today)}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Summary
                </div>
                {isAdmin && adminEditOpen ? (
                  <textarea
                    rows={3}
                    value={adminEditDraft.summary}
                    onChange={(event) =>
                      setAdminEditDraft((prev) => ({
                        ...prev,
                        summary: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                  />
                ) : (
                  <div className="mt-2 text-sm text-slate-600">
                    {focusedTask.summary?.trim() || 'None set'}
                  </div>
                )}
              </div>

              {isAdmin && adminEditOpen ? (
                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Notes
                  </div>
                  <textarea
                    rows={4}
                    value={adminEditDraft.notes}
                    onChange={(event) =>
                      setAdminEditDraft((prev) => ({
                        ...prev,
                        notes: event.target.value,
                      }))
                    }
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                  />
                </div>
              ) : noteEntries.length ? (
                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Notes
                  </div>
                  <div className="mt-3 space-y-3">
                    {noteEntries.map((entry, index) => {
                      const authorName = entry.author || 'Unknown';
                      const authorKey = authorName.toLowerCase();
                      const assigneeMatch = focusedTask?.assignees.find(
                        (assignee) => (assignee.name ?? '').toLowerCase() === authorKey,
                      );
                      const userMatch = users.find(
                        (member) => member.name.toLowerCase() === authorKey,
                      );
                      const avatarUrl =
                        assigneeMatch?.avatarUrl ?? userMatch?.avatarUrl ?? null;
                      const displayName =
                        assigneeMatch?.name ?? userMatch?.name ?? authorName;
                      return (
                        <div
                          key={`${entry.timestamp}-${entry.author}-${index}`}
                          className="flex items-start gap-3"
                        >
                          {avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={displayName}
                              className="h-9 w-9 rounded-full object-cover"
                            />
                          ) : (
                            <div
                              className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600"
                              title={displayName}
                            >
                              {getInitials(displayName)}
                            </div>
                          )}
                          <div>
                            <div className="text-sm text-slate-700">{entry.text}</div>
                            {entry.timestamp ? (
                              <div className="mt-1 text-xs text-slate-400">
                                {entry.timestamp}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
              {noteOpen ? (
                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Add note
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    Appends with your name and time.
                  </div>
                  {noteError ? (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {noteError}
                    </div>
                  ) : null}
                  {noteSuccess ? (
                    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      {noteSuccess}
                    </div>
                  ) : null}
                  <textarea
                    rows={3}
                    value={noteDraft}
                    onChange={(event) => setNoteDraft(event.target.value)}
                    className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                  />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleSaveNote}
                      disabled={!canActOnTask || noteSaving}
                      className="rounded-full bg-slate-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {noteSaving ? 'Saving...' : 'Save note'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setNoteOpen(false)}
                      className="rounded-full border border-slate-200 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              {focusedTask.approvalStatus === 'rejected' && focusedTask.rejectionReason ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                  Rejection reason: {focusedTask.rejectionReason}
                </div>
              ) : null}
              {canRequestAssignees ? (
                <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white px-4 py-4">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Request assignees
                  </div>
                  {requestError ? (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {requestError}
                    </div>
                  ) : null}
                  {requestSuccess ? (
                    <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      {requestSuccess}
                    </div>
                  ) : null}
                  {usersLoading ? (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      Loading users...
                    </div>
                  ) : usersError ? (
                    <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                      {usersError}
                    </div>
                  ) : (
                    <div className="mt-2 max-h-32 space-y-1 overflow-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
                      {users.map((member) => {
                        const isAssigned = assignedAssigneeIds.has(member.id);
                        return (
                          <label
                            key={member.id}
                            className={`flex items-center gap-2 text-xs ${
                              isAssigned ? 'text-slate-400' : 'text-slate-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={requestAssigneeIds.includes(member.id)}
                              onChange={() => toggleSelection(setRequestAssigneeIds, member.id)}
                              disabled={isAssigned}
                              className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
                            />
                            <span className="font-medium">{member.name}</span>
                            <span className="text-[10px] text-slate-400">{member.email}</span>
                            {isAssigned ? (
                              <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                                assigned
                              </span>
                            ) : null}
                          </label>
                        );
                      })}
                    </div>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleRequestAssignees}
                      disabled={requestSaving}
                      className="rounded-full bg-slate-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-60"
                    >
                      {requestSaving ? 'Sending...' : 'Request assignments'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRequestAssigneeIds([])}
                      className="rounded-full border border-slate-200 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap items-center gap-2 border-t border-slate-200 pt-4">
                {focusedTask.href ? (
                  <Link
                    href={focusedTask.href}
                    className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-white shadow-[0_12px_40px_-24px_rgba(15,23,42,0.6)] transition hover:bg-slate-800"
                  >
                    Open workspace
                  </Link>
                ) : null}
                {focusedTask.status === 'todo' && !isAssignedToUser && !isAdmin && !readOnly ? (
                  <button
                    type="button"
                    onClick={handleRequestAssign}
                    disabled={selfAssignSaving}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 disabled:opacity-60"
                  >
                    {selfAssignSaving ? 'Sending...' : 'Request assign'}
                  </button>
                ) : null}
                {focusedTask.status === 'in_progress' &&
                !isAssignedToUser &&
                !isAdmin &&
                !readOnly ? (
                  <button
                    type="button"
                    onClick={handleAssignToMe}
                    disabled={selfAssignSaving}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 disabled:opacity-60"
                  >
                    {selfAssignSaving ? 'Assigning...' : 'Assign to me'}
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() =>
                    setNoteOpen((prev) => {
                      if (!prev) {
                        setNoteDraft('');
                        setNoteError('');
                        setNoteSuccess('');
                      }
                      return !prev;
                    })
                  }
                  disabled={!canActOnTask}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 disabled:opacity-60"
                >
                  Add note
                </button>
                {focusedTask.status === 'in_progress' ? (
                  <button
                    type="button"
                    onClick={handleDoneRequest}
                    disabled={!canActOnTask || doneSaving}
                    className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 disabled:opacity-60"
                  >
                    {doneSaving ? 'Sending...' : 'Mark done'}
                  </button>
                ) : null}
              </div>
              {selfAssignError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                  {selfAssignError}
                </div>
              ) : null}
              {selfAssignSuccess ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
                  {selfAssignSuccess}
                </div>
              ) : null}
              {doneError ? (
                <div className="mt-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                  {doneError}
                </div>
              ) : null}
              {doneSuccess ? (
                <div className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
                  {doneSuccess}
                </div>
              ) : null}

              {readOnly ? (
                <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-700">
                  You have view-only access. Ask a manager to update tasks.
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
        {assignModalOpen && focusedTask && isAdmin ? (
          <div
            className="fixed inset-0 z-[60] flex items-start justify-center overflow-auto bg-slate-900/50 px-4 pb-12 pt-32 backdrop-blur-sm sm:pt-36"
            onClick={closeAssignModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.24em] text-slate-400">
                    Assign users
                  </p>
                  <h3 className="mt-1 text-lg font-semibold text-slate-900">
                    {focusedTask.title}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={closeAssignModal}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
                >
                  Close
                </button>
              </div>
              {assignError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-2 text-xs text-rose-700">
                  {assignError}
                </div>
              ) : null}
              {assignSuccess ? (
                <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-xs text-emerald-700">
                  {assignSuccess}
                </div>
              ) : null}
              {usersLoading ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  Loading users...
                </div>
              ) : usersError ? (
                <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
                  {usersError}
                </div>
              ) : users.length === 0 ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                  No active users available.
                </div>
              ) : (
                <div className="mt-4 max-h-64 space-y-1 overflow-auto rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  {users.map((member) => (
                    <label
                      key={member.id}
                      className="flex items-center gap-2 text-xs text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={assignDraftIds.includes(member.id)}
                        onChange={() => toggleAssignDraft(member.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 accent-slate-900"
                      />
                      <span className="font-medium">{member.name}</span>
                      <span className="text-[10px] text-slate-400">{member.email}</span>
                    </label>
                  ))}
                </div>
              )}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleAssignUsers}
                  disabled={assignSaving}
                  className="rounded-full bg-slate-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-60"
                >
                  {assignSaving ? 'Saving...' : 'Update assignments'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}
