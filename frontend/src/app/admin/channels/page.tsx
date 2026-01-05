'use client';

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import AdminShell from "../../../components/AdminShell";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import type { CommunityChannel } from "../../../components/community/types";

const getErrorMessage = (err: unknown, fallback: string) => {
  if (err instanceof Error && err.message) return err.message;
  return fallback;
};

export default function AdminChannelsPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [channels, setChannels] = useState<CommunityChannel[]>([]);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");

  const loadChannels = useCallback(async (authToken: string) => {
    setLoadingList(true);
    setError("");
    try {
      const list = await api<CommunityChannel[]>("/community/channels", undefined, authToken);
      setChannels(list ?? []);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Failed to load channels."));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace("/auth");
      return;
    }
    if (user.role !== "ADMIN") {
      router.replace("/workspace");
      return;
    }
    void loadChannels(token);
  }, [loading, user, token, router, loadChannels]);

  const sortedChannels = useMemo(
    () => [...channels].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")),
    [channels],
  );

  async function addChannel() {
    if (!token) return;
    const name = newName.trim();
    if (!name) {
      setError("Channel name required.");
      return;
    }
    setSavingId("new");
    setError("");
    const description = newDescription.trim();
    const payload: Record<string, string> = { name };
    if (description) payload.description = description;
    try {
      await api("/community/channels", { method: "POST", body: JSON.stringify(payload) }, token);
      setNewName("");
      setNewDescription("");
      await loadChannels(token);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Unable to add channel."));
    } finally {
      setSavingId(null);
    }
  }

  function startEdit(channel: CommunityChannel) {
    setEditingId(channel.id);
    setEditName(channel.name ?? "");
    setEditDescription(channel.description ?? "");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName("");
    setEditDescription("");
  }

  async function saveEdit(id: string) {
    if (!token) return;
    const name = editName.trim();
    if (!name) {
      setError("Channel name required.");
      return;
    }
    setSavingId(id);
    setError("");
    try {
      await api(
        `/community/channels/${id}`,
        { method: "PATCH", body: JSON.stringify({ name, description: editDescription.trim() }) },
        token,
      );
      cancelEdit();
      await loadChannels(token);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Unable to save channel."));
    } finally {
      setSavingId(null);
    }
  }

  async function removeChannel(id: string) {
    if (!token) return;
    setSavingId(id);
    setError("");
    try {
      await api(`/community/channels/${id}`, { method: "DELETE" }, token);
      if (editingId === id) cancelEdit();
      await loadChannels(token);
    } catch (err) {
      console.error(err);
      setError(getErrorMessage(err, "Unable to delete channel."));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Admin</p>
          <h1 className="text-3xl font-semibold text-slate-900">Channel management</h1>
          <p className="text-sm text-slate-600">Add, rename, or remove channels for the community space.</p>
        </div>

        {error && (
          <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        )}

        <section className="rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Channels</h2>
              <p className="text-xs text-slate-500">{sortedChannels.length} total</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Channel name"
                className="w-44 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-slate-300"
              />
              <input
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                placeholder="Description (optional)"
                className="w-64 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-slate-300"
              />
              <button
                onClick={addChannel}
                disabled={savingId === "new"}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-60"
              >
                Add
              </button>
            </div>
          </div>

          {loadingList ? (
            <div className="px-4 py-6 text-sm text-slate-600">Loading channels...</div>
          ) : sortedChannels.length === 0 ? (
            <div className="px-4 py-6 text-sm text-slate-600">No channels yet. Add one to get started.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {sortedChannels.map((channel) => {
                const isEditing = editingId === channel.id;
                return (
                  <div key={channel.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                    {isEditing ? (
                      <>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="min-w-[200px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-slate-300"
                        />
                        <input
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          placeholder="Description"
                          className="min-w-[240px] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none ring-1 ring-transparent focus:ring-slate-300"
                        />
                        <button
                          onClick={() => saveEdit(channel.id)}
                          disabled={savingId === channel.id}
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          onClick={cancelEdit}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <div className="flex min-w-[240px] flex-1 flex-col">
                          <span className="text-sm font-semibold text-slate-900">
                            #{channel.name ?? "channel"}
                          </span>
                          <span className="text-xs text-slate-500">
                            {channel.description ? channel.description : "No description"}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => startEdit(channel)}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => removeChannel(channel.id)}
                            disabled={savingId === channel.id}
                            className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                          >
                            Delete
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
