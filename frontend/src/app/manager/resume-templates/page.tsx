'use client';

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import ManagerShell from "../../../components/ManagerShell";

type ResumeTemplate = {
  id: string;
  name: string;
  description?: string | null;
  html: string;
  createdAt: string;
  updatedAt: string;
};

type TemplateDraft = {
  name: string;
  description: string;
  html: string;
};

type EditorMode = "view" | "edit" | "create";

const DEFAULT_TEMPLATE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Resume</title>
  <style>
    body { font-family: "Arial", sans-serif; margin: 32px; color: #0f172a; }
    h1 { font-size: 24px; margin: 0 0 4px; }
    h2 { font-size: 12px; margin: 20px 0 6px; text-transform: uppercase; letter-spacing: 2px; color: #475569; }
    p, li { font-size: 13px; line-height: 1.5; }
    .muted { color: #64748b; font-size: 12px; }
    .resume-item { margin-bottom: 12px; }
    .resume-meta { color: #64748b; font-size: 12px; }
    .section { margin-top: 16px; }
    .item { margin-bottom: 10px; }
  </style>
</head>
<body>
  <header>
    <h1>{{profile.name}}</h1>
    <div class="muted">{{profile.headline}} | {{profile.contact.location}}</div>
    <div class="muted">
      {{profile.contact.email}} | {{profile.contact.phone}} | {{profile.contact.linkedin}}
    </div>
  </header>
  <section class="section">
    <h2>Summary</h2>
    <p>{{summary}}</p>
  </section>
  <section class="section">
    <h2>Experience</h2>
    {{work_experience}}
  </section>
  <section class="section">
    <h2>Education</h2>
    {{education}}
  </section>
  <section class="section">
    <h2>Skills</h2>
    <p>{{skills}}</p>
  </section>
</body>
</html>`;

const EMPTY_PREVIEW_HTML = `<!doctype html>
<html>
<body style="font-family: Arial, sans-serif; padding: 24px; color: #475569;">
  <p>No HTML to preview yet.</p>
</body>
</html>`;

export default function ManagerResumeTemplatesPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>("view");
  const [draft, setDraft] = useState<TemplateDraft>(getEmptyDraft());
  const [saving, setSaving] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user || !token) {
      router.replace("/auth");
      return;
    }
    if (user.role !== "MANAGER" && user.role !== "ADMIN") {
      router.replace("/workspace");
      return;
    }
    void loadTemplates(token);
  }, [loading, user, token, router]);

  useEffect(() => {
    if (mode === "create") return;
    if (selectedId && templates.some((template) => template.id === selectedId)) return;
    setSelectedId(templates[0]?.id ?? null);
  }, [mode, selectedId, templates]);

  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === selectedId) ?? null,
    [selectedId, templates],
  );

  useEffect(() => {
    if (mode !== "view") return;
    if (!selectedTemplate) return;
    setDraft(buildDraftFromTemplate(selectedTemplate));
  }, [mode, selectedTemplate]);

  const previewHtml =
    mode === "view"
      ? selectedTemplate?.html ?? ""
      : draft.html;
  const previewDoc = previewHtml.trim() ? previewHtml : EMPTY_PREVIEW_HTML;

  async function loadTemplates(authToken: string) {
    setLoadingTemplates(true);
    setError("");
    try {
      const data = await api<ResumeTemplate[]>("/resume-templates", undefined, authToken);
      setTemplates(sortTemplates(data));
    } catch (err) {
      console.error(err);
      setError("Failed to load templates.");
    } finally {
      setLoadingTemplates(false);
    }
  }

  function startCreate() {
    setMode("create");
    setSelectedId(null);
    setDraft(getEmptyDraft());
    setError("");
  }

  function selectTemplate(id: string) {
    setMode("view");
    setSelectedId(id);
    setError("");
  }

  function startEdit() {
    if (!selectedTemplate) return;
    setMode("edit");
    setDraft(buildDraftFromTemplate(selectedTemplate));
    setError("");
  }

  function cancelEdit() {
    if (mode === "create") {
      setMode("view");
      setSelectedId(templates[0]?.id ?? null);
      setDraft(getEmptyDraft());
      return;
    }
    setMode("view");
    if (selectedTemplate) {
      setDraft(buildDraftFromTemplate(selectedTemplate));
    }
  }

  async function handleSave() {
    if (!token) return;
    const name = draft.name.trim();
    const html = draft.html.trim();
    if (!name) {
      setError("Template name is required.");
      return;
    }
    if (!html) {
      setError("Template HTML is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      if (mode === "create") {
        const created = await api<ResumeTemplate>(
          "/resume-templates",
          {
            method: "POST",
            body: JSON.stringify({
              name,
              description: normalizeDescription(draft.description),
              html: draft.html,
            }),
          },
          token,
        );
        setTemplates((prev) => sortTemplates([created, ...prev]));
        setSelectedId(created.id);
        setMode("view");
      }
      if (mode === "edit" && selectedTemplate) {
        const updated = await api<ResumeTemplate>(
          `/resume-templates/${selectedTemplate.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name,
              description: normalizeDescription(draft.description),
              html: draft.html,
            }),
          },
          token,
        );
        setTemplates((prev) =>
          sortTemplates(prev.map((item) => (item.id === updated.id ? updated : item))),
        );
        setSelectedId(updated.id);
        setMode("view");
      }
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Unable to save template.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!token || !selectedTemplate) return;
    const ok = window.confirm(`Delete template "${selectedTemplate.name}"?`);
    if (!ok) return;
    setSaving(true);
    setError("");
    try {
      await api(`/resume-templates/${selectedTemplate.id}`, { method: "DELETE" }, token);
      const remaining = templates.filter((item) => item.id !== selectedTemplate.id);
      setTemplates(remaining);
      setSelectedId(remaining[0]?.id ?? null);
      setMode("view");
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Unable to delete template.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ManagerShell>
      <div className="space-y-6">
        <div className="space-y-2">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Manager</p>
          <h1 className="text-3xl font-semibold text-slate-900">Resume templates</h1>
          <p className="text-sm text-slate-600">
            Store HTML-based resume templates and preview them before use.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-400/50 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {error}
          </div>
        ) : null}

        <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Templates</h2>
                <p className="text-xs text-slate-500">{templates.length} total</p>
              </div>
              <button
                type="button"
                onClick={startCreate}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
              >
                New template
              </button>
            </div>
            <div className="divide-y divide-slate-200">
              {loadingTemplates ? (
                <div className="px-4 py-6 text-sm text-slate-600">Loading templates...</div>
              ) : templates.length === 0 ? (
                <div className="px-4 py-6 text-sm text-slate-600">
                  No templates yet. Create one to get started.
                </div>
              ) : (
                templates.map((template) => {
                  const active = template.id === selectedId;
                  return (
                    <button
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template.id)}
                      className={`w-full text-left px-4 py-3 transition ${
                        active
                          ? "bg-slate-100 text-slate-900"
                          : "bg-white text-slate-700 hover:bg-slate-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold">{template.name}</div>
                          <div className="text-xs text-slate-500">
                            {template.description || "No description"}
                          </div>
                        </div>
                        <div className="text-xs text-slate-400">
                          {formatDate(template.updatedAt)}
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            {!selectedTemplate && mode !== "create" ? (
              <div className="text-sm text-slate-600">
                Select a template from the list or create a new one.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                      {mode === "create" ? "Create template" : "Template details"}
                    </p>
                    <h2 className="text-lg font-semibold text-slate-900">
                      {mode === "view"
                        ? selectedTemplate?.name
                        : draft.name || "Untitled template"}
                    </h2>
                    {mode === "view" && selectedTemplate ? (
                      <p className="text-xs text-slate-500">
                        Updated {formatDate(selectedTemplate.updatedAt)}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mode === "view" && selectedTemplate ? (
                      <>
                        <button
                          type="button"
                          onClick={startEdit}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={handleDelete}
                          disabled={saving}
                          className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-60"
                        >
                          Delete
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleSave}
                          disabled={saving}
                          className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                        >
                          {saving ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {mode !== "view" ? (
                  <div className="space-y-3">
                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Name</span>
                      <input
                        value={draft.name}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, name: event.target.value }))
                        }
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">
                        Description
                      </span>
                      <textarea
                        value={draft.description}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, description: event.target.value }))
                        }
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                      />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs uppercase tracking-[0.18em] text-slate-500">HTML</span>
                      <textarea
                        value={draft.html}
                        onChange={(event) =>
                          setDraft((prev) => ({ ...prev, html: event.target.value }))
                        }
                        rows={12}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                      />
                    </label>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    {selectedTemplate?.description || "No description provided."}
                  </div>
                )}

                <div>
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">Preview</div>
                  <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <iframe
                      title="Resume template preview"
                      srcDoc={previewDoc}
                      className="h-[480px] w-full"
                      sandbox=""
                      referrerPolicy="no-referrer"
                    />
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </ManagerShell>
  );
}

function getEmptyDraft(): TemplateDraft {
  return { name: "", description: "", html: DEFAULT_TEMPLATE_HTML };
}

function buildDraftFromTemplate(template: ResumeTemplate): TemplateDraft {
  return {
    name: template.name ?? "",
    description: template.description ?? "",
    html: template.html ?? "",
  };
}

function normalizeDescription(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function sortTemplates(items: ResumeTemplate[]) {
  return [...items].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt).getTime();
    return bTime - aTime;
  });
}

function formatDate(value?: string | null) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
