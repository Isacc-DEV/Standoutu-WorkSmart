'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../components/AdminShell';
import { api } from '../../../lib/api';
import { ClientUser } from '../../../lib/auth';
import { useAuth } from '../../../lib/useAuth';

type TaskStatus = 'todo' | 'in_progress' | 'in_review' | 'done';
type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
type TaskApprovalStatus = 'pending' | 'approved' | 'rejected';

type TaskAssignee = {
  id: string;
  name: string;
  email?: string | null;
};

type Task = {
  id: string;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  approvalStatus?: TaskApprovalStatus;
  dueDate: string | null;
  createdBy?: string | null;
  summary?: string | null;
  notes?: string | null;
  project?: string | null;
  tags?: string[];
  assignees: TaskAssignee[];
  createdAt: string;
};

type AssignmentRequest = {
  id: string;
  taskId: string;
  taskTitle: string;
  taskApprovalStatus: TaskApprovalStatus;
  userId: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  requesterName?: string | null;
  requesterEmail?: string | null;
  assigneeName?: string | null;
  assigneeEmail?: string | null;
  createdAt: string;
};

type DoneRequest = {
  id: string;
  taskId: string;
  taskTitle: string;
  requestedBy: string;
  status: 'pending' | 'approved' | 'rejected';
  requesterName?: string | null;
  requesterEmail?: string | null;
  createdAt: string;
};

type RequestKind = 'task_add' | 'task_done' | 'assign';

type TaskRequestRow = {
  id: string;
  kind: RequestKind;
  taskId: string;
  taskTitle: string;
  requesterName: string;
  requesterEmail: string;
  createdAt: string;
  assigneeName?: string;
  assigneeEmail?: string;
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: 'To do',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
};

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

const formatShortDate = (value?: string | null) => {
  if (!value) return 'none set';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return 'none set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
  }).format(date);
};

const formatAssignees = (assignees: TaskAssignee[]) => {
  const cleaned = assignees
    .map((assignee) => {
      const name = assignee.name?.trim();
      const email = assignee.email?.trim();
      return name || email || '';
    })
    .filter(Boolean);
  return cleaned.length ? cleaned.join(', ') : 'Unassigned';
};

type NoteEntry = {
  author: string;
  timestamp: string;
  text: string;
};

const parseTaskNotes = (notes?: string | null): NoteEntry[] => {
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
};

const getInitials = (name: string) => {
  const cleaned = name.trim();
  if (!cleaned) return '?';
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  const first = parts[0]?.[0] ?? '';
  const second = parts.length > 1 ? parts[1]?.[0] ?? '' : parts[0]?.[1] ?? '';
  const initials = `${first}${second}`.toUpperCase();
  return initials || '?';
};

const formatRequestDate = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

export default function AdminTasksPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [assignmentRequests, setAssignmentRequests] = useState<AssignmentRequest[]>([]);
  const [doneRequests, setDoneRequests] = useState<DoneRequest[]>([]);
  const [users, setUsers] = useState<ClientUser[]>([]);
  const [error, setError] = useState('');
  const [loadingData, setLoadingData] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [dueDateSaving, setDueDateSaving] = useState(false);
  const [dueDateError, setDueDateError] = useState('');
  const [dueDateSuccess, setDueDateSuccess] = useState('');

  const usersById = useMemo(() => {
    const map = new Map<string, ClientUser>();
    users.forEach((member) => map.set(member.id, member));
    return map;
  }, [users]);

  const tasksById = useMemo(() => {
    const map = new Map<string, Task>();
    tasks.forEach((task) => map.set(task.id, task));
    return map;
  }, [tasks]);

  const requestRows = useMemo(() => {
    const rows: TaskRequestRow[] = [];
    pendingTasks.forEach((task) => {
      const requester = task.createdBy ? usersById.get(task.createdBy) : null;
      rows.push({
        id: task.id,
        kind: 'task_add',
        taskId: task.id,
        taskTitle: task.title,
        requesterName: requester?.name ?? 'Unknown',
        requesterEmail: requester?.email ?? '',
        createdAt: task.createdAt,
      });
    });
    assignmentRequests.forEach((request) => {
      rows.push({
        id: request.id,
        kind: 'assign',
        taskId: request.taskId,
        taskTitle: request.taskTitle,
        requesterName: request.requesterName ?? 'Unknown',
        requesterEmail: request.requesterEmail ?? '',
        createdAt: request.createdAt,
        assigneeName: request.assigneeName ?? undefined,
        assigneeEmail: request.assigneeEmail ?? undefined,
      });
    });
    doneRequests.forEach((request) => {
      rows.push({
        id: request.id,
        kind: 'task_done',
        taskId: request.taskId,
        taskTitle: request.taskTitle,
        requesterName: request.requesterName ?? 'Unknown',
        requesterEmail: request.requesterEmail ?? '',
        createdAt: request.createdAt,
      });
    });
    rows.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    return rows;
  }, [pendingTasks, assignmentRequests, doneRequests, usersById]);

  const selectedTask = selectedTaskId ? tasksById.get(selectedTaskId) ?? null : null;
  const noteEntries = useMemo(
    () => parseTaskNotes(selectedTask?.notes),
    [selectedTask?.notes],
  );

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace('/auth');
      return;
    }
    if (user.role !== 'ADMIN') {
      router.replace('/workspace');
      return;
    }
    void loadAll(token);
  }, [loading, user, token, router]);

  useEffect(() => {
    if (!selectedTask) {
      setDueDateDraft('');
      setDueDateError('');
      setDueDateSuccess('');
      return;
    }
    setDueDateDraft(selectedTask.dueDate ?? '');
    setDueDateError('');
    setDueDateSuccess('');
  }, [selectedTaskId]);

  async function loadAll(authToken: string) {
    setLoadingData(true);
    setError('');
    try {
      const [taskList, pendingList, assignmentList, doneList, userList] = await Promise.all([
        api<Task[]>('/tasks', undefined, authToken),
        api<Task[]>('/tasks/requests', undefined, authToken),
        api<AssignmentRequest[]>('/tasks/assign-requests', undefined, authToken),
        api<DoneRequest[]>('/tasks/done-requests', undefined, authToken),
        api<ClientUser[]>('/users', undefined, authToken),
      ]);
      setTasks(Array.isArray(taskList) ? taskList : []);
      setPendingTasks(Array.isArray(pendingList) ? pendingList : []);
      setAssignmentRequests(Array.isArray(assignmentList) ? assignmentList : []);
      setDoneRequests(Array.isArray(doneList) ? doneList : []);
      setUsers(Array.isArray(userList) ? userList : []);
    } catch (err) {
      console.error(err);
      setError('Unable to load task admin data.');
    } finally {
      setLoadingData(false);
    }
  }

  async function approveTask(taskId: string) {
    if (!token) return;
    setActionId(taskId);
    setError('');
    try {
      await api(`/tasks/${taskId}/approve`, { method: 'POST' }, token);
      await loadAll(token);
    } catch (err) {
      console.error(err);
      setError('Failed to approve task.');
    } finally {
      setActionId(null);
    }
  }

  async function rejectTask(taskId: string) {
    if (!token) return;
    setActionId(taskId);
    setError('');
    try {
      await api(
        `/tasks/${taskId}/reject`,
        { method: 'POST', body: JSON.stringify({ reason: null }) },
        token,
      );
      await loadAll(token);
    } catch (err) {
      console.error(err);
      setError('Failed to reject task.');
    } finally {
      setActionId(null);
    }
  }

  async function approveAssignment(requestId: string) {
    if (!token) return;
    setActionId(requestId);
    setError('');
    try {
      await api(`/tasks/assign-requests/${requestId}/approve`, { method: 'POST' }, token);
      await loadAll(token);
    } catch (err) {
      console.error(err);
      setError('Failed to approve assignment request.');
    } finally {
      setActionId(null);
    }
  }

  async function rejectAssignment(requestId: string) {
    if (!token) return;
    setActionId(requestId);
    setError('');
    try {
      await api(
        `/tasks/assign-requests/${requestId}/reject`,
        { method: 'POST', body: JSON.stringify({ reason: null }) },
        token,
      );
      await loadAll(token);
    } catch (err) {
      console.error(err);
      setError('Failed to reject assignment request.');
    } finally {
      setActionId(null);
    }
  }

  async function approveDone(requestId: string) {
    if (!token) return;
    setActionId(requestId);
    setError('');
    try {
      await api(`/tasks/done-requests/${requestId}/approve`, { method: 'POST' }, token);
      await loadAll(token);
    } catch (err) {
      console.error(err);
      setError('Failed to approve done request.');
    } finally {
      setActionId(null);
    }
  }

  async function rejectDone(requestId: string) {
    if (!token) return;
    setActionId(requestId);
    setError('');
    try {
      await api(
        `/tasks/done-requests/${requestId}/reject`,
        { method: 'POST', body: JSON.stringify({ reason: null }) },
        token,
      );
      await loadAll(token);
    } catch (err) {
      console.error(err);
      setError('Failed to reject done request.');
    } finally {
      setActionId(null);
    }
  }

  const openTaskModal = (taskId: string) => {
    setSelectedTaskId(taskId);
    setTaskModalOpen(true);
  };

  const closeTaskModal = () => {
    setTaskModalOpen(false);
    setSelectedTaskId(null);
  };

  const handleSaveDueDate = async () => {
    if (!token || !selectedTaskId) return;
    setDueDateSaving(true);
    setDueDateError('');
    setDueDateSuccess('');
    try {
      const payload = {
        dueDate: dueDateDraft.trim() || null,
      };
      await api(`/tasks/${selectedTaskId}`, { method: 'PATCH', body: JSON.stringify(payload) }, token);
      setDueDateSuccess('Due date updated.');
      await loadAll(token);
    } catch (err) {
      console.error(err);
      setDueDateError('Failed to update due date.');
    } finally {
      setDueDateSaving(false);
    }
  };

  const handleApprove = (row: TaskRequestRow) => {
    if (row.kind === 'task_add') {
      return approveTask(row.taskId);
    }
    if (row.kind === 'assign') {
      return approveAssignment(row.id);
    }
    return approveDone(row.id);
  };

  const handleReject = (row: TaskRequestRow) => {
    if (row.kind === 'task_add') {
      return rejectTask(row.taskId);
    }
    if (row.kind === 'assign') {
      return rejectAssignment(row.id);
    }
    return rejectDone(row.id);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Admin</p>
          <h1 className="text-3xl font-semibold text-slate-900">Task approvals</h1>
          <p className="text-sm text-slate-600">
            Review task requests, approve assignment changes, and keep workloads aligned.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        {loadingData ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Loading task admin data...
          </div>
        ) : null}

        <div className="space-y-4">
          <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="grid grid-cols-[1.2fr_2fr_1.2fr_1fr_1fr] gap-3 bg-slate-50 px-4 py-3 text-xs uppercase tracking-[0.14em] text-slate-600">
              <div>Detail</div>
              <div>Task</div>
              <div>Request by</div>
              <div>Due</div>
              <div>Actions</div>
            </div>
            <div className="divide-y divide-slate-200">
              {requestRows.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-600">No pending requests.</div>
              ) : (
                requestRows.map((row) => {
                  const task = tasksById.get(row.taskId);
                  const summaryText = task?.summary?.trim();
                  const detailLabel =
                    row.kind === 'task_add'
                      ? 'Task add request'
                      : row.kind === 'task_done'
                      ? 'Task done request'
                      : 'Assign request';
                  return (
                    <div
                      key={`${row.kind}-${row.id}`}
                      className="grid grid-cols-[1.2fr_2fr_1.2fr_1fr_1fr] gap-3 px-4 py-3 text-sm text-slate-800"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{detailLabel}</div>
                        {row.assigneeName ? (
                          <div className="text-xs text-slate-500">
                            Assignee: {row.assigneeName}
                          </div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={() => openTaskModal(row.taskId)}
                        className="text-left"
                      >
                        <div className="font-semibold text-slate-900">{row.taskTitle}</div>
                        <div className="text-xs text-slate-500">
                          {summaryText || 'No summary'}
                        </div>
                      </button>
                      <div className="text-slate-700">
                        {row.requesterName}
                        <div className="text-xs text-slate-400">{row.requesterEmail}</div>
                      </div>
                      <div className="text-slate-700">{formatRequestDate(row.createdAt)}</div>
                      <div className="flex gap-2 text-xs">
                        <button
                          onClick={() => handleApprove(row)}
                          disabled={actionId === row.id}
                          className="rounded-full bg-[#4ade80] px-3 py-1 font-semibold text-[#0b1224] hover:brightness-110 disabled:opacity-60"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => handleReject(row)}
                          disabled={actionId === row.id}
                          className="rounded-full border border-slate-200 px-3 py-1 text-slate-800 hover:bg-slate-100 disabled:opacity-60"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        {taskModalOpen && selectedTask ? (
          <div
            className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/50 px-4 pb-12 pt-32 backdrop-blur-sm sm:pt-36"
            onClick={closeTaskModal}
          >
            <div
              role="dialog"
              aria-modal="true"
              className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-2xl sm:p-8"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    {selectedTask.title}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={closeTaskModal}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600"
                >
                  Close
                </button>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-600">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {STATUS_LABELS[selectedTask.status]}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {PRIORITY_LABELS[selectedTask.priority]}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  {(selectedTask.approvalStatus ?? 'approved').replace('_', ' ')}
                </span>
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Assigned to
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatAssignees(selectedTask.assignees)}
                  </div>
                  <div className="text-xs text-slate-500">
                    {selectedTask.project ?? 'No project'}
                  </div>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Due date
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {formatShortDate(selectedTask.dueDate)}
                  </div>
                  <div className="text-xs text-slate-500">
                    Created {formatRequestDate(selectedTask.createdAt)}
                  </div>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Update due date
                </div>
                {dueDateError ? (
                  <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                    {dueDateError}
                  </div>
                ) : null}
                {dueDateSuccess ? (
                  <div className="mt-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                    {dueDateSuccess}
                  </div>
                ) : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={dueDateDraft}
                    onChange={(event) => setDueDateDraft(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300 sm:w-auto"
                  />
                  <button
                    type="button"
                    onClick={handleSaveDueDate}
                    disabled={dueDateSaving}
                    className="rounded-full bg-slate-900 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    {dueDateSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                  Summary
                </div>
                <div className="mt-2 text-sm text-slate-600">
                  {selectedTask.summary?.trim() || 'None set'}
                </div>
              </div>

              {noteEntries.length ? (
                <div className="mt-4 rounded-2xl border border-slate-200 bg-white px-3 py-3">
                  <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
                    Notes
                  </div>
                  <div className="mt-3 space-y-3">
                    {noteEntries.map((entry, index) => {
                      const authorName = entry.author || 'Unknown';
                      const authorKey = authorName.toLowerCase();
                      const userMatch = users.find(
                        (member) => member.name.toLowerCase() === authorKey,
                      );
                      const avatarUrl = userMatch?.avatarUrl ?? null;
                      const displayName = userMatch?.name ?? authorName;
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

              {selectedTask.tags?.length ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  {selectedTask.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-slate-500"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
