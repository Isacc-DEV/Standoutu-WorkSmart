'use client';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type MouseEventHandler,
} from "react";
import { useRouter } from "next/navigation";
import { API_BASE, api } from "../../../lib/api";
import { useAuth } from "../../../lib/useAuth";
import ManagerShell from "../../../components/ManagerShell";

type BaseInfo = {
  name?: { first?: string; last?: string };
  contact?: { email?: string; phone?: string; phoneCode?: string; phoneNumber?: string };
  location?: { address?: string; city?: string; state?: string; country?: string; postalCode?: string };
  career?: { jobTitle?: string; currentCompany?: string; yearsExp?: string | number; desiredSalary?: string };
  education?: { school?: string; degree?: string; majorField?: string; graduationAt?: string };
  workAuth?: { authorized?: boolean; needsSponsorship?: boolean };
  links?: Record<string, string> & { linkedin?: string };
  preferences?: Record<string, unknown>;
  defaultAnswers?: Record<string, string>;
};

type BaseResume = {
  Profile?: {
    name?: string;
    headline?: string;
    contact?: {
      location?: string;
      email?: string;
      phone?: string;
      linkedin?: string;
    };
  };
  summary?: { text?: string };
  workExperience?: Array<{
    companyTitle?: string;
    roleTitle?: string;
    employmentType?: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    bullets?: string[];
  }>;
  education?: Array<{
    institution?: string;
    degree?: string;
    field?: string;
    date?: string;
    coursework?: string[];
  }>;
  skills?: { raw?: string[] };
};

type ProfileContact = NonNullable<NonNullable<BaseResume["Profile"]>["contact"]>;
type WorkExperience = NonNullable<BaseResume["workExperience"]>[number];
type WorkExperienceField = keyof Omit<WorkExperience, "bullets">;
type EducationEntry = NonNullable<BaseResume["education"]>[number];
type EducationField = keyof Omit<EducationEntry, "coursework">;

type Profile = {
  id: string;
  displayName: string;
  baseInfo: BaseInfo;
  baseResume?: BaseResume;
  createdAt: string;
  updatedAt: string;
};

type Assignment = {
  id: string;
  profileId: string;
  bidderUserId: string;
  assignedBy: string;
  assignedAt: string;
  unassignedAt?: string | null;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "BIDDER" | "OBSERVER";
  isActive?: boolean;
};

type ResumeTemplate = {
  id: string;
  name: string;
  description?: string | null;
  html: string;
  createdAt: string;
  updatedAt: string;
};

type SectionKey = "contact" | "location" | "career" | "education" | "workAuth";

const DEFAULT_SECTION_STATE = {
  contact: { show: false, edit: false },
  location: { show: false, edit: false },
  career: { show: false, edit: false },
  education: { show: false, edit: false },
  workAuth: { show: false, edit: false },
};

const DEFAULT_BASE_RESUME_SECTIONS = {
  profile: true,
  summary: true,
  work: true,
  education: true,
  skills: true,
};

const EMPTY_RESUME_PREVIEW = `<!doctype html>
<html>
<body style="font-family: Arial, sans-serif; padding: 24px; color: #475569;">
  <p>No template selected.</p>
</body>
</html>`;

const srOnly = "absolute -m-px h-px w-px overflow-hidden whitespace-nowrap border-0 p-0";

export default function ManagerProfilesPage() {
  const router = useRouter();
  const { user, token, loading } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [bidders, setBidders] = useState<User[]>([]);
  const [draftBase, setDraftBase] = useState<BaseInfo>({});
  const [baseResumeDraft, setBaseResumeDraft] = useState<BaseResume>(getEmptyBaseResume());
  const [baseResumeError, setBaseResumeError] = useState("");
  const [baseResumeEdit, setBaseResumeEdit] = useState(false);
  const [baseResumeSections, setBaseResumeSections] = useState(DEFAULT_BASE_RESUME_SECTIONS);
  const [baseResumeWorkOpen, setBaseResumeWorkOpen] = useState<boolean[]>([]);
  const [baseResumeEducationOpen, setBaseResumeEducationOpen] = useState<boolean[]>([]);
  const [savingBaseResume, setSavingBaseResume] = useState(false);
  const baseResumeInputRef = useRef<HTMLInputElement | null>(null);
  const [resumeTemplates, setResumeTemplates] = useState<ResumeTemplate[]>([]);
  const [resumeTemplatesLoading, setResumeTemplatesLoading] = useState(false);
  const [resumeTemplatesError, setResumeTemplatesError] = useState("");
  const [resumePreviewOpen, setResumePreviewOpen] = useState(false);
  const [resumeTemplateId, setResumeTemplateId] = useState<string>("");
  const [resumePdfLoading, setResumePdfLoading] = useState(false);
  const [resumeExportError, setResumeExportError] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [assignLoading, setAssignLoading] = useState(false);
  const [assignBidderId, setAssignBidderId] = useState<string>("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createForm, setCreateForm] = useState(getEmptyCreateForm());
  const [sectionState, setSectionState] = useState(DEFAULT_SECTION_STATE);
  const toggleSection = (key: SectionKey, field: "show" | "edit") => {
    setSectionState((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: !prev[key][field] },
    }));
  };
  const setSectionEdit = (key: SectionKey, value: boolean) => {
    setSectionState((prev) => ({
      ...prev,
      [key]: { ...prev[key], edit: value },
    }));
  };
  const startSectionEdit = (key: SectionKey) => {
    setSectionState((prev) => ({
      ...prev,
      [key]: { ...prev[key], show: true, edit: true },
    }));
  };
  const resetSectionDraft = (key: SectionKey) => {
    if (!selectedProfile) return;
    const clean = cleanBaseInfo(selectedProfile.baseInfo);
    setDraftBase((prev) => {
      const next = { ...prev };
      switch (key) {
        case "contact":
          next.name = { ...clean.name };
          next.contact = { ...clean.contact };
          next.links = { ...(clean.links ?? {}) };
          break;
        case "location":
          next.location = { ...clean.location };
          break;
        case "career":
          next.career = { ...clean.career };
          break;
        case "education":
          next.education = { ...clean.education };
          break;
        case "workAuth":
          next.workAuth = { ...clean.workAuth };
          break;
        default:
          break;
      }
      return next;
    });
  };
  const cancelSectionEdit = (key: SectionKey) => {
    resetSectionDraft(key);
    setSectionState((prev) => ({
      ...prev,
      [key]: { ...prev[key], edit: false, show: true },
    }));
  };
  const saveSection = (key: SectionKey) => {
    void handleSaveProfile(key);
  };

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedId),
    [profiles, selectedId],
  );
  const activeAssignment = useMemo(
    () => assignments.find((a) => a.profileId === selectedId && !a.unassignedAt),
    [assignments, selectedId],
  );

  const loadProfiles = useCallback(async (authToken: string) => {
    try {
      const list = await api<Profile[]>("/profiles", undefined, authToken);
      setProfiles(list);
      setSelectedId("");
      setDetailOpen(false);
      setAddOpen(false);
    } catch (err) {
      console.error(err);
      setError("Failed to load profiles.");
    }
  }, []);

  const loadAssignments = useCallback(async (authToken: string) => {
    try {
      const list = await api<Assignment[]>("/assignments", undefined, authToken);
      setAssignments(list);
    } catch (err) {
      console.error(err);
      setError("Failed to load assignments.");
    }
  }, []);

  const loadBidders = useCallback(async (authToken: string) => {
    try {
      const list = await api<User[]>("/users", undefined, authToken);
      const filtered = list.filter((u) => u.role === "BIDDER" && u.isActive !== false);
      setBidders(filtered);
      const fallbackId = filtered[0]?.id;
      if (fallbackId) {
        setAssignBidderId((current) => current || fallbackId);
      }
    } catch (err) {
      console.error(err);
      setError("Failed to load bidders.");
    }
  }, []);

  const loadResumeTemplates = useCallback(async (authToken: string) => {
    setResumeTemplatesLoading(true);
    setResumeTemplatesError("");
    try {
      const list = await api<ResumeTemplate[]>("/resume-templates", undefined, authToken);
      setResumeTemplates(list);
    } catch (err) {
      console.error(err);
      setResumeTemplatesError("Failed to load resume templates.");
    } finally {
      setResumeTemplatesLoading(false);
    }
  }, []);

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
    void loadProfiles(token);
    void loadBidders(token);
    void loadAssignments(token);
    void loadResumeTemplates(token);
  }, [
    loading,
    user,
    token,
    router,
    loadProfiles,
    loadBidders,
    loadAssignments,
    loadResumeTemplates,
  ]);

  useEffect(() => {
    if (!selectedProfile || !token) {
      setBaseResumeDraft(getEmptyBaseResume());
      setBaseResumeError("");
      setBaseResumeEdit(false);
      setBaseResumeSections(DEFAULT_BASE_RESUME_SECTIONS);
      setBaseResumeWorkOpen([]);
      setBaseResumeEducationOpen([]);
      setResumePreviewOpen(false);
      setResumeExportError("");
      return;
    }
    const normalizedBaseResume = normalizeBaseResume(selectedProfile.baseResume);
    setDraftBase(cleanBaseInfo(selectedProfile.baseInfo));
    setBaseResumeDraft(normalizedBaseResume);
    setBaseResumeError("");
    setBaseResumeEdit(false);
    setBaseResumeSections(DEFAULT_BASE_RESUME_SECTIONS);
    setBaseResumeWorkOpen(normalizedBaseResume.workExperience?.map(() => true) ?? []);
    setBaseResumeEducationOpen(normalizedBaseResume.education?.map(() => true) ?? []);
    setSectionState(DEFAULT_SECTION_STATE);
    if (activeAssignment) {
      setAssignBidderId(activeAssignment.bidderUserId);
    } else if (bidders[0]) {
      setAssignBidderId(bidders[0].id);
    }
  }, [activeAssignment, bidders, selectedProfile, token]);

  useEffect(() => {
    if (!resumeTemplates.length) {
      setResumeTemplateId("");
      return;
    }
    if (!resumeTemplateId || !resumeTemplates.some((t) => t.id === resumeTemplateId)) {
      setResumeTemplateId(resumeTemplates[0].id);
    }
  }, [resumeTemplates, resumeTemplateId]);

  async function handleSaveProfile(sectionKey?: SectionKey) {
    if (!selectedProfile || !token) return;
    setSaving(true);
    setError("");
    try {
      const basePayload = buildBaseInfoPayload(draftBase);
      const updated = await api<Profile>(
        `/profiles/${selectedProfile.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            displayName: selectedProfile.displayName,
            baseInfo: basePayload,
          }),
        },
        token,
      );
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === updated.id ? { ...updated, baseInfo: cleanBaseInfo(updated.baseInfo) } : p,
        ),
      );
      setDraftBase(cleanBaseInfo(updated.baseInfo));
      if (sectionKey) setSectionEdit(sectionKey, false);
    } catch (err) {
      console.error(err);
      setError("Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleImportBaseResume(file: File) {
    setBaseResumeError("");
    try {
      if (!baseResumeEdit) setBaseResumeEdit(true);
      const text = await readFileAsText(file);
      const parsed = parseBaseResumeText(text);
      const normalized = normalizeBaseResume(parsed);
      setBaseResumeDraft(normalized);
      setBaseResumeWorkOpen(normalized.workExperience?.map(() => true) ?? []);
      setBaseResumeEducationOpen(normalized.education?.map(() => true) ?? []);
    } catch (err) {
      console.error(err);
      setBaseResumeError("Invalid JSON file.");
    }
  }

  async function handleSaveBaseResume() {
    if (!selectedProfile || !token) return;
    setBaseResumeError("");
    const payload = normalizeBaseResume(baseResumeDraft);
    setSavingBaseResume(true);
    setError("");
    try {
      const updated = await api<Profile>(
        `/profiles/${selectedProfile.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            baseResume: payload,
          }),
        },
        token,
      );
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === updated.id
            ? {
              ...updated,
              baseInfo: cleanBaseInfo(updated.baseInfo),
              baseResume: normalizeBaseResume(updated.baseResume),
            }
            : p,
        ),
      );
      setBaseResumeDraft(normalizeBaseResume(updated.baseResume));
      setBaseResumeEdit(false);
    } catch (err) {
      console.error(err);
      setBaseResumeError("Could not save base resume.");
    } finally {
      setSavingBaseResume(false);
    }
  }

  function handleCancelBaseResume() {
    setBaseResumeDraft(normalizeBaseResume(selectedProfile?.baseResume));
    setBaseResumeError("");
    setBaseResumeEdit(false);
  }

  function handleOpenResumePreview() {
    setResumePreviewOpen(true);
    setResumeExportError("");
    if (!resumeTemplates.length && token) {
      void loadResumeTemplates(token);
    }
  }

  async function handleDownloadResumePdf() {
    if (!token) return;
    if (!resumePreviewHtml.trim()) {
      setResumeExportError("Select a template to export.");
      return;
    }
    setResumePdfLoading(true);
    setResumeExportError("");
    try {
      const base = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
      const url = new URL("/resume-templates/render-pdf", base).toString();
      const fileName = buildResumePdfName(selectedProfile?.displayName, selectedTemplate?.name);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ html: resumePreviewHtml, filename: fileName }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Unable to export PDF.");
      }
      const blob = await res.blob();
      const headerName = getPdfFilenameFromHeader(res.headers.get("content-disposition"));
      const downloadName = headerName || `${fileName}.pdf`;
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = downloadName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Unable to export PDF.";
      setResumeExportError(message);
    } finally {
      setResumePdfLoading(false);
    }
  }

  function toggleBaseResumeSection(key: keyof typeof DEFAULT_BASE_RESUME_SECTIONS) {
    setBaseResumeSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function toggleWorkExperienceOpen(index: number) {
    setBaseResumeWorkOpen((prev) => {
      const next = syncOpenList(prev, baseResumeView.workExperience?.length ?? 0);
      if (!next.length || index < 0 || index >= next.length) return next;
      next[index] = !next[index];
      return next;
    });
  }

  function toggleEducationOpen(index: number) {
    setBaseResumeEducationOpen((prev) => {
      const next = syncOpenList(prev, baseResumeView.education?.length ?? 0);
      if (!next.length || index < 0 || index >= next.length) return next;
      next[index] = !next[index];
      return next;
    });
  }

  function updateBaseResumeProfileField(field: "name" | "headline", value: string) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const profile = next.Profile ?? {};
      return {
        ...next,
        Profile: { ...profile, [field]: value, contact: { ...(profile.contact ?? {}) } },
      };
    });
  }

  function updateBaseResumeContactField(field: keyof ProfileContact, value: string) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const profile = next.Profile ?? {};
      return {
        ...next,
        Profile: {
          ...profile,
          contact: { ...(profile.contact ?? {}), [field]: value },
        },
      };
    });
  }

  function updateBaseResumeSummary(value: string) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      return { ...next, summary: { ...(next.summary ?? {}), text: value } };
    });
  }

  function updateWorkExperienceField(index: number, field: WorkExperienceField, value: string) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.workExperience ?? [])];
      const current = { ...(items[index] ?? getEmptyWorkExperience()) } as WorkExperience;
      current[field] = value;
      items[index] = current;
      return { ...next, workExperience: items };
    });
  }

  function addWorkExperience() {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      return {
        ...next,
        workExperience: [...(next.workExperience ?? []), getEmptyWorkExperience()],
      };
    });
  }

  function removeWorkExperience(index: number) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.workExperience ?? [])];
      if (items.length <= 1) {
        items[0] = getEmptyWorkExperience();
      } else {
        items.splice(index, 1);
      }
      return { ...next, workExperience: items };
    });
  }

  function updateWorkExperienceBullet(index: number, bulletIndex: number, value: string) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.workExperience ?? [])];
      const current = { ...(items[index] ?? getEmptyWorkExperience()) } as WorkExperience;
      const bullets = [...(current.bullets ?? [""])];
      bullets[bulletIndex] = value;
      current.bullets = bullets;
      items[index] = current;
      return { ...next, workExperience: items };
    });
  }

  function addWorkExperienceBullet(index: number) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.workExperience ?? [])];
      const current = { ...(items[index] ?? getEmptyWorkExperience()) } as WorkExperience;
      const bullets = [...(current.bullets ?? [""]), ""];
      current.bullets = bullets;
      items[index] = current;
      return { ...next, workExperience: items };
    });
  }

  function removeWorkExperienceBullet(index: number, bulletIndex: number) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.workExperience ?? [])];
      const current = { ...(items[index] ?? getEmptyWorkExperience()) } as WorkExperience;
      const bullets = [...(current.bullets ?? [""])];
      if (bullets.length <= 1) {
        bullets[0] = "";
      } else {
        bullets.splice(bulletIndex, 1);
      }
      current.bullets = bullets;
      items[index] = current;
      return { ...next, workExperience: items };
    });
  }

  function updateEducationField(index: number, field: EducationField, value: string) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.education ?? [])];
      const current = { ...(items[index] ?? getEmptyEducation()) } as EducationEntry;
      current[field] = value;
      items[index] = current;
      return { ...next, education: items };
    });
  }

  function addEducation() {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      return { ...next, education: [...(next.education ?? []), getEmptyEducation()] };
    });
  }

  function removeEducation(index: number) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.education ?? [])];
      if (items.length <= 1) {
        items[0] = getEmptyEducation();
      } else {
        items.splice(index, 1);
      }
      return { ...next, education: items };
    });
  }

  function updateEducationCoursework(
    index: number,
    courseIndex: number,
    value: string,
  ) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.education ?? [])];
      const current = { ...(items[index] ?? getEmptyEducation()) } as EducationEntry;
      const coursework = [...(current.coursework ?? [""])];
      coursework[courseIndex] = value;
      current.coursework = coursework;
      items[index] = current;
      return { ...next, education: items };
    });
  }

  function addEducationCoursework(index: number) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.education ?? [])];
      const current = { ...(items[index] ?? getEmptyEducation()) } as EducationEntry;
      const coursework = [...(current.coursework ?? [""]), ""];
      current.coursework = coursework;
      items[index] = current;
      return { ...next, education: items };
    });
  }

  function removeEducationCoursework(index: number, courseIndex: number) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const items = [...(next.education ?? [])];
      const current = { ...(items[index] ?? getEmptyEducation()) } as EducationEntry;
      const coursework = [...(current.coursework ?? [""])];
      if (coursework.length <= 1) {
        coursework[0] = "";
      } else {
        coursework.splice(courseIndex, 1);
      }
      current.coursework = coursework;
      items[index] = current;
      return { ...next, education: items };
    });
  }

  function updateSkill(index: number, value: string) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const skills = { ...(next.skills ?? {}) };
      const raw = [...(skills.raw ?? [""])];
      raw[index] = value;
      skills.raw = raw;
      return { ...next, skills };
    });
  }

  function addSkill() {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const skills = { ...(next.skills ?? {}) };
      const raw = [...(skills.raw ?? [""]), ""];
      skills.raw = raw;
      return { ...next, skills };
    });
  }

  function removeSkill(index: number) {
    setBaseResumeDraft((prev) => {
      const next = normalizeBaseResume(prev);
      const skills = { ...(next.skills ?? {}) };
      const raw = [...(skills.raw ?? [""])];
      if (raw.length <= 1) {
        raw[0] = "";
      } else {
        raw.splice(index, 1);
      }
      skills.raw = raw;
      return { ...next, skills };
    });
  }

  const draft = cleanBaseInfo(draftBase);
  const baseResumeView = normalizeBaseResume(baseResumeDraft);
  const selectedTemplate = useMemo(
    () => resumeTemplates.find((template) => template.id === resumeTemplateId) ?? null,
    [resumeTemplates, resumeTemplateId],
  );
  const resumePreviewHtml = useMemo(() => {
    if (!selectedTemplate?.html) return "";
    return renderResumeTemplate(selectedTemplate.html, baseResumeView);
  }, [selectedTemplate, baseResumeView]);
  const resumePreviewDoc = resumePreviewHtml.trim() ? resumePreviewHtml : EMPTY_RESUME_PREVIEW;
  const baseResumeDirty = useMemo(
    () => serializeBaseResume(baseResumeDraft) !== serializeBaseResume(selectedProfile?.baseResume),
    [baseResumeDraft, selectedProfile],
  );
  const baseResumeLocked = !baseResumeEdit || savingBaseResume;
  const creatingDisabled =
    createLoading || !createForm.displayName.trim() || createForm.displayName.trim().length < 2;

  useEffect(() => {
    setBaseResumeWorkOpen((prev) =>
      syncOpenList(prev, baseResumeView.workExperience?.length ?? 0),
    );
  }, [baseResumeView.workExperience?.length]);

  useEffect(() => {
    setBaseResumeEducationOpen((prev) =>
      syncOpenList(prev, baseResumeView.education?.length ?? 0),
    );
  }, [baseResumeView.education?.length]);

  return (
    <ManagerShell>
      <div className="grid gap-6 lg:grid-cols-[280px,1fr]">
        <aside className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Profiles</div>
                <button
                  onClick={() => {
                    setAddOpen(true);
                    setDetailOpen(false);
                    setSelectedId("");
                    setCreateForm(getEmptyCreateForm());
                  }}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Add profile
                </button>
          </div>
          <div className="space-y-2">
            {profiles.length === 0 ? (
              <div className="text-sm text-slate-600">No profiles available.</div>
            ) : (
              profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedId(p.id);
                    setDetailOpen(true);
                    setSectionState(DEFAULT_SECTION_STATE);
                  }}
                  className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
                    selectedId === p.id
                      ? "bg-slate-100 text-slate-900 border border-slate-200"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <div className="font-semibold">{p.displayName}</div>
                  <div className="text-xs text-slate-500">
                    Updated {new Date(p.updatedAt).toLocaleDateString()}
                  </div>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div
            className={`fixed top-0 right-0 z-40 h-full w-full max-w-2xl transform border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${detailOpen ? "translate-x-0" : "translate-x-full"}`}
          >
            {selectedProfile ? (
              <div className="flex h-full flex-col overflow-y-auto p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Profile</p>
                    <h1 className="text-2xl font-semibold text-slate-900">
                      {selectedProfile.displayName}
                    </h1>
                    <p className="text-sm text-slate-600">
                      Manage core details and contact information.
                    </p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                        Assignment
                      </p>
                      <p className="text-sm text-slate-600">
                        Link this profile to an active bidder.
                      </p>
                    </div>
                    <div className="text-xs text-slate-500">
                      {activeAssignment
                        ? `Assigned since ${new Date(activeAssignment.assignedAt).toLocaleDateString()}`
                        : "Unassigned"}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 md:flex-row md:items-center">
                    <select
                      value={assignBidderId}
                      onChange={(e) => setAssignBidderId(e.target.value)}
                      className="w-full md:w-auto rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                    >
                      {bidders.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button
                        onClick={handleAssign}
                        disabled={assignLoading || !assignBidderId}
                        className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {assignLoading ? "Saving..." : activeAssignment ? "Update" : "Assign"}
                      </button>
                      {activeAssignment && (
                        <button
                          onClick={() => handleUnassign(activeAssignment.id)}
                          disabled={assignLoading}
                          className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Unassign
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <SectionHeader
                    title="Contact"
                    state={sectionState.contact}
                    onToggleShow={() => toggleSection("contact", "show")}
                    onEdit={() => startSectionEdit("contact")}
                    onSave={() => {
                      if (saving) return;
                      saveSection("contact");
                    }}
                    onCancel={() => cancelSectionEdit("contact")}
                  />
                  {sectionState.contact.show
                    ? sectionState.contact.edit
                      ? (
                        <>
                          <LabeledInput label="First name" value={draft.name?.first ?? ""} onChange={(v) => updateBase("name.first", v)} />
                          <LabeledInput label="Last name" value={draft.name?.last ?? ""} onChange={(v) => updateBase("name.last", v)} />
                          <LabeledInput label="Email" value={draft.contact?.email ?? ""} onChange={(v) => updateBase("contact.email", v)} />
                          <LabeledInput label="Phone code" value={draft.contact?.phoneCode ?? ""} onChange={(v) => updateBase("contact.phoneCode", v)} />
                          <LabeledInput label="Phone number" value={draft.contact?.phoneNumber ?? ""} onChange={(v) => updateBase("contact.phoneNumber", v)} />
                          <LabeledInput label="LinkedIn" value={draft.links?.linkedin ?? ""} onChange={(v) => updateBase("links.linkedin", v)} />
                        </>
                      )
                      : (
                        <>
                          <ReadRow label="First name" value={draft.name?.first ?? "-"} />
                          <ReadRow label="Last name" value={draft.name?.last ?? "-"} />
                          <ReadRow label="Email" value={draft.contact?.email ?? "-"} />
                          <ReadRow label="Phone code" value={draft.contact?.phoneCode ?? "-"} />
                          <ReadRow label="Phone number" value={draft.contact?.phoneNumber ?? "-"} />
                          <ReadRow label="Phone (combined)" value={formatPhone(draft.contact)} />
                          <ReadRow label="LinkedIn" value={draft.links?.linkedin ?? "-"} />
                        </>
                      )
                    : null}

                  <SectionHeader
                    title="Location"
                    state={sectionState.location}
                    onToggleShow={() => toggleSection("location", "show")}
                    onEdit={() => startSectionEdit("location")}
                    onSave={() => {
                      if (saving) return;
                      saveSection("location");
                    }}
                    onCancel={() => cancelSectionEdit("location")}
                  />
                  {sectionState.location.show
                    ? sectionState.location.edit
                      ? (
                        <>
                          <LabeledInput label="Address" value={draft.location?.address ?? ""} onChange={(v) => updateBase("location.address", v)} />
                          <LabeledInput label="City" value={draft.location?.city ?? ""} onChange={(v) => updateBase("location.city", v)} />
                          <LabeledInput label="State / Province" value={draft.location?.state ?? ""} onChange={(v) => updateBase("location.state", v)} />
                          <LabeledInput label="Country" value={draft.location?.country ?? ""} onChange={(v) => updateBase("location.country", v)} />
                          <LabeledInput label="Postal code" value={draft.location?.postalCode ?? ""} onChange={(v) => updateBase("location.postalCode", v)} />
                        </>
                      )
                      : (
                        <>
                          <ReadRow label="Address" value={draft.location?.address ?? "-"} />
                          <ReadRow label="City" value={draft.location?.city ?? "-"} />
                          <ReadRow label="State / Province" value={draft.location?.state ?? "-"} />
                          <ReadRow label="Country" value={draft.location?.country ?? "-"} />
                          <ReadRow label="Postal code" value={draft.location?.postalCode ?? "-"} />
                        </>
                      )
                    : null}

                  <SectionHeader
                    title="Career"
                    state={sectionState.career}
                    onToggleShow={() => toggleSection("career", "show")}
                    onEdit={() => startSectionEdit("career")}
                    onSave={() => {
                      if (saving) return;
                      saveSection("career");
                    }}
                    onCancel={() => cancelSectionEdit("career")}
                  />
                  {sectionState.career.show
                    ? sectionState.career.edit
                      ? (
                        <>
                          <LabeledInput label="Job title" value={draft.career?.jobTitle ?? ""} onChange={(v) => updateBase("career.jobTitle", v)} />
                          <LabeledInput label="Current company" value={draft.career?.currentCompany ?? ""} onChange={(v) => updateBase("career.currentCompany", v)} />
                          <LabeledInput label="Years of experience" value={(draft.career?.yearsExp as string) ?? ""} onChange={(v) => updateBase("career.yearsExp", v)} />
                          <LabeledInput label="Desired salary" value={draft.career?.desiredSalary ?? ""} onChange={(v) => updateBase("career.desiredSalary", v)} />
                        </>
                      )
                      : (
                        <>
                          <ReadRow label="Job title" value={draft.career?.jobTitle ?? "-"} />
                          <ReadRow label="Current company" value={draft.career?.currentCompany ?? "-"} />
                          <ReadRow label="Years of experience" value={(draft.career?.yearsExp as string) ?? "-"} />
                          <ReadRow label="Desired salary" value={draft.career?.desiredSalary ?? "-"} />
                        </>
                      )
                    : null}

                  <SectionHeader
                    title="Education"
                    state={sectionState.education}
                    onToggleShow={() => toggleSection("education", "show")}
                    onEdit={() => startSectionEdit("education")}
                    onSave={() => {
                      if (saving) return;
                      saveSection("education");
                    }}
                    onCancel={() => cancelSectionEdit("education")}
                  />
                  {sectionState.education.show
                    ? sectionState.education.edit
                      ? (
                        <>
                          <LabeledInput label="School" value={draft.education?.school ?? ""} onChange={(v) => updateBase("education.school", v)} />
                          <LabeledInput label="Degree" value={draft.education?.degree ?? ""} onChange={(v) => updateBase("education.degree", v)} />
                          <LabeledInput label="Major / field" value={draft.education?.majorField ?? ""} onChange={(v) => updateBase("education.majorField", v)} />
                          <LabeledInput label="Graduation date" value={draft.education?.graduationAt ?? ""} onChange={(v) => updateBase("education.graduationAt", v)} />
                        </>
                      )
                      : (
                        <>
                          <ReadRow label="School" value={draft.education?.school ?? "-"} />
                          <ReadRow label="Degree" value={draft.education?.degree ?? "-"} />
                          <ReadRow label="Major / field" value={draft.education?.majorField ?? "-"} />
                          <ReadRow label="Graduation date" value={draft.education?.graduationAt ?? "-"} />
                        </>
                      )
                    : null}

                  <SectionHeader
                    title="Authorized to work"
                    state={sectionState.workAuth}
                    onToggleShow={() => toggleSection("workAuth", "show")}
                    onEdit={() => startSectionEdit("workAuth")}
                    onSave={() => {
                      if (saving) return;
                      saveSection("workAuth");
                    }}
                    onCancel={() => cancelSectionEdit("workAuth")}
                  />
                  {sectionState.workAuth.show
                    ? sectionState.workAuth.edit
                      ? (
                        <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                          <input
                            type="checkbox"
                            checked={Boolean(draft.workAuth?.authorized)}
                            onChange={(e) => updateBase("workAuth.authorized", e.target.checked)}
                            className="h-4 w-4 rounded border-slate-300 text-[#0b1224]"
                          />
                          Authorized to work
                        </label>
                      )
                      : (
                        <ReadRow
                          label="Authorized to work"
                          value={draft.workAuth?.authorized ? "Yes" : "No"}
                        />
                      )
                    : null}
                </div>

                <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div className="flex flex-col">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                        Base resume
                      </p>
                      <p className="text-sm text-slate-600">
                        Edit the base resume details used for tailoring.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={handleOpenResumePreview}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100"
                      >
                        Preview
                      </button>
                      <input
                        ref={baseResumeInputRef}
                        type="file"
                        accept=".json,application/json"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleImportBaseResume(file);
                          }
                          e.currentTarget.value = "";
                        }}
                      />
                      <button
                        onClick={() => {
                          if (!baseResumeEdit) setBaseResumeEdit(true);
                          baseResumeInputRef.current?.click();
                        }}
                        disabled={savingBaseResume}
                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Import JSON
                      </button>
                      {baseResumeEdit ? (
                        <>
                          <button
                            onClick={handleSaveBaseResume}
                            disabled={savingBaseResume || !baseResumeDirty}
                            className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {savingBaseResume ? "Saving..." : "Save"}
                          </button>
                          <button
                            onClick={handleCancelBaseResume}
                            disabled={savingBaseResume}
                            className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => {
                            setBaseResumeEdit(true);
                            setBaseResumeError("");
                          }}
                          className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                  {baseResumeError ? (
                    <div className="mb-3 text-xs text-red-600">{baseResumeError}</div>
                  ) : null}
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Profile
                        </p>
                        <IconButton
                          onClick={() => toggleBaseResumeSection("profile")}
                          title={baseResumeSections.profile ? "Hide section" : "Show section"}
                        >
                          <TriangleIcon direction={baseResumeSections.profile ? "down" : "left"} />
                          <span className={srOnly}>
                            {baseResumeSections.profile ? "Hide profile" : "Show profile"}
                          </span>
                        </IconButton>
                      </div>
                      {baseResumeSections.profile ? (
                        <div className="grid gap-3 md:grid-cols-2">
                          <LabeledInput
                            label="Name"
                            value={baseResumeView.Profile?.name ?? ""}
                            onChange={(v) => updateBaseResumeProfileField("name", v)}
                            disabled={baseResumeLocked}
                          />
                          <LabeledInput
                            label="Headline"
                            value={baseResumeView.Profile?.headline ?? ""}
                            onChange={(v) => updateBaseResumeProfileField("headline", v)}
                            disabled={baseResumeLocked}
                          />
                          <LabeledInput
                            label="Location"
                            value={baseResumeView.Profile?.contact?.location ?? ""}
                            onChange={(v) => updateBaseResumeContactField("location", v)}
                            disabled={baseResumeLocked}
                          />
                          <LabeledInput
                            label="Email"
                            value={baseResumeView.Profile?.contact?.email ?? ""}
                            onChange={(v) => updateBaseResumeContactField("email", v)}
                            disabled={baseResumeLocked}
                          />
                          <LabeledInput
                            label="Phone"
                            value={baseResumeView.Profile?.contact?.phone ?? ""}
                            onChange={(v) => updateBaseResumeContactField("phone", v)}
                            disabled={baseResumeLocked}
                          />
                          <LabeledInput
                            label="LinkedIn"
                            value={baseResumeView.Profile?.contact?.linkedin ?? ""}
                            onChange={(v) => updateBaseResumeContactField("linkedin", v)}
                            disabled={baseResumeLocked}
                          />
                        </div>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Summary
                        </p>
                        <IconButton
                          onClick={() => toggleBaseResumeSection("summary")}
                          title={baseResumeSections.summary ? "Hide section" : "Show section"}
                        >
                          <TriangleIcon direction={baseResumeSections.summary ? "down" : "left"} />
                          <span className={srOnly}>
                            {baseResumeSections.summary ? "Hide summary" : "Show summary"}
                          </span>
                        </IconButton>
                      </div>
                      {baseResumeSections.summary ? (
                        <label className="space-y-1">
                          <span className="text-xs uppercase tracking-[0.18em] text-slate-600">
                            Text
                          </span>
                          <textarea
                            value={baseResumeView.summary?.text ?? ""}
                            onChange={(e) => updateBaseResumeSummary(e.target.value)}
                            rows={4}
                            disabled={baseResumeLocked}
                            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                          />
                        </label>
                      ) : null}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Work experience
                        </p>
                        <div className="flex items-center gap-2">
                          <IconButton
                            onClick={() => toggleBaseResumeSection("work")}
                            title={baseResumeSections.work ? "Hide section" : "Show section"}
                          >
                            <TriangleIcon direction={baseResumeSections.work ? "down" : "left"} />
                            <span className={srOnly}>
                              {baseResumeSections.work ? "Hide work experience" : "Show work experience"}
                            </span>
                          </IconButton>
                          {baseResumeEdit ? (
                            <button
                              onClick={addWorkExperience}
                              disabled={baseResumeLocked}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Add
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {baseResumeSections.work
                        ? baseResumeView.workExperience?.map((item, index) => {
                          const isOpen = baseResumeWorkOpen[index] ?? true;
                          const subLabel = [item.roleTitle, item.companyTitle]
                            .filter(Boolean)
                            .join(" - ");
                          return (
                            <div
                              key={`work-${index}`}
                              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <IconButton
                                    onClick={() => toggleWorkExperienceOpen(index)}
                                    title={isOpen ? "Hide role" : "Show role"}
                                  >
                                    <TriangleIcon direction={isOpen ? "down" : "left"} />
                                    <span className={srOnly}>
                                      {isOpen ? "Hide role" : "Show role"}
                                    </span>
                                  </IconButton>
                                  <button
                                    type="button"
                                    onClick={() => toggleWorkExperienceOpen(index)}
                                    className="flex items-center gap-2 text-left"
                                    aria-expanded={isOpen}
                                  >
                                    <p className="text-sm font-semibold text-slate-800">
                                      Role {index + 1}
                                    </p>
                                    {!isOpen && subLabel ? (
                                      <span className="text-xs text-slate-500">{subLabel}</span>
                                    ) : null}
                                  </button>
                                </div>
                                {baseResumeEdit ? (
                                  <button
                                    onClick={() => removeWorkExperience(index)}
                                    disabled={baseResumeLocked}
                                    className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                              {isOpen ? (
                                <>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledInput
                                      label="Company"
                                      value={item.companyTitle ?? ""}
                                      onChange={(v) =>
                                        updateWorkExperienceField(index, "companyTitle", v)
                                      }
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="Role title"
                                      value={item.roleTitle ?? ""}
                                      onChange={(v) =>
                                        updateWorkExperienceField(index, "roleTitle", v)
                                      }
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="Employment type"
                                      value={item.employmentType ?? ""}
                                      onChange={(v) =>
                                        updateWorkExperienceField(index, "employmentType", v)
                                      }
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="Location"
                                      value={item.location ?? ""}
                                      onChange={(v) =>
                                        updateWorkExperienceField(index, "location", v)
                                      }
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="Start date"
                                      value={item.startDate ?? ""}
                                      onChange={(v) =>
                                        updateWorkExperienceField(index, "startDate", v)
                                      }
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="End date"
                                      value={item.endDate ?? ""}
                                      onChange={(v) =>
                                        updateWorkExperienceField(index, "endDate", v)
                                      }
                                      disabled={baseResumeLocked}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                                      Bullets
                                    </p>
                                    {item.bullets?.map((bullet, bulletIndex) => (
                                      <div key={`bullet-${bulletIndex}`} className="flex items-center gap-2">
                                        <input
                                          value={bullet ?? ""}
                                          onChange={(e) =>
                                            updateWorkExperienceBullet(
                                              index,
                                              bulletIndex,
                                              e.target.value,
                                            )
                                          }
                                          disabled={baseResumeLocked}
                                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                                        />
                                        {baseResumeEdit ? (
                                          <button
                                            onClick={() =>
                                              removeWorkExperienceBullet(index, bulletIndex)
                                            }
                                            disabled={baseResumeLocked}
                                            className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            Remove
                                          </button>
                                        ) : null}
                                      </div>
                                    ))}
                                    {baseResumeEdit ? (
                                      <button
                                        onClick={() => addWorkExperienceBullet(index)}
                                        disabled={baseResumeLocked}
                                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Add bullet
                                      </button>
                                    ) : null}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          );
                        })
                        : null}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Education
                        </p>
                        <div className="flex items-center gap-2">
                          <IconButton
                            onClick={() => toggleBaseResumeSection("education")}
                            title={baseResumeSections.education ? "Hide section" : "Show section"}
                          >
                            <TriangleIcon
                              direction={baseResumeSections.education ? "down" : "left"}
                            />
                            <span className={srOnly}>
                              {baseResumeSections.education ? "Hide education" : "Show education"}
                            </span>
                          </IconButton>
                          {baseResumeEdit ? (
                            <button
                              onClick={addEducation}
                              disabled={baseResumeLocked}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Add
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {baseResumeSections.education
                        ? baseResumeView.education?.map((item, index) => {
                          const isOpen = baseResumeEducationOpen[index] ?? true;
                          const subLabel = [item.degree, item.institution]
                            .filter(Boolean)
                            .join(" - ");
                          return (
                            <div
                              key={`education-${index}`}
                              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <IconButton
                                    onClick={() => toggleEducationOpen(index)}
                                    title={isOpen ? "Hide education" : "Show education"}
                                  >
                                    <TriangleIcon direction={isOpen ? "down" : "left"} />
                                    <span className={srOnly}>
                                      {isOpen ? "Hide education" : "Show education"}
                                    </span>
                                  </IconButton>
                                  <button
                                    type="button"
                                    onClick={() => toggleEducationOpen(index)}
                                    className="flex items-center gap-2 text-left"
                                    aria-expanded={isOpen}
                                  >
                                    <p className="text-sm font-semibold text-slate-800">
                                      School {index + 1}
                                    </p>
                                    {!isOpen && subLabel ? (
                                      <span className="text-xs text-slate-500">{subLabel}</span>
                                    ) : null}
                                  </button>
                                </div>
                                {baseResumeEdit ? (
                                  <button
                                    onClick={() => removeEducation(index)}
                                    disabled={baseResumeLocked}
                                    className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                  >
                                    Remove
                                  </button>
                                ) : null}
                              </div>
                              {isOpen ? (
                                <>
                                  <div className="grid gap-3 md:grid-cols-2">
                                    <LabeledInput
                                      label="Institution"
                                      value={item.institution ?? ""}
                                      onChange={(v) =>
                                        updateEducationField(index, "institution", v)
                                      }
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="Degree"
                                      value={item.degree ?? ""}
                                      onChange={(v) => updateEducationField(index, "degree", v)}
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="Field"
                                      value={item.field ?? ""}
                                      onChange={(v) => updateEducationField(index, "field", v)}
                                      disabled={baseResumeLocked}
                                    />
                                    <LabeledInput
                                      label="Date"
                                      value={item.date ?? ""}
                                      onChange={(v) => updateEducationField(index, "date", v)}
                                      disabled={baseResumeLocked}
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                                      Coursework
                                    </p>
                                    {item.coursework?.map((course, courseIndex) => (
                                      <div key={`course-${courseIndex}`} className="flex items-center gap-2">
                                        <input
                                          value={course ?? ""}
                                          onChange={(e) =>
                                            updateEducationCoursework(
                                              index,
                                              courseIndex,
                                              e.target.value,
                                            )
                                          }
                                          disabled={baseResumeLocked}
                                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                                        />
                                        {baseResumeEdit ? (
                                          <button
                                            onClick={() =>
                                              removeEducationCoursework(index, courseIndex)
                                            }
                                            disabled={baseResumeLocked}
                                            className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                          >
                                            Remove
                                          </button>
                                        ) : null}
                                      </div>
                                    ))}
                                    {baseResumeEdit ? (
                                      <button
                                        onClick={() => addEducationCoursework(index)}
                                        disabled={baseResumeLocked}
                                        className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                                      >
                                        Add coursework
                                      </button>
                                    ) : null}
                                  </div>
                                </>
                              ) : null}
                            </div>
                          );
                        })
                        : null}
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                          Skills
                        </p>
                        <div className="flex items-center gap-2">
                          <IconButton
                            onClick={() => toggleBaseResumeSection("skills")}
                            title={baseResumeSections.skills ? "Hide section" : "Show section"}
                          >
                            <TriangleIcon direction={baseResumeSections.skills ? "down" : "left"} />
                            <span className={srOnly}>
                              {baseResumeSections.skills ? "Hide skills" : "Show skills"}
                            </span>
                          </IconButton>
                          {baseResumeEdit ? (
                            <button
                              onClick={addSkill}
                              disabled={baseResumeLocked}
                              className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-800 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Add
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {baseResumeSections.skills ? (
                        <div className="space-y-2">
                          {baseResumeView.skills?.raw?.map((skill, index) => (
                            <div key={`skill-${index}`} className="flex items-center gap-2">
                              <input
                                value={skill ?? ""}
                                onChange={(e) => updateSkill(index, e.target.value)}
                                disabled={baseResumeLocked}
                                className="flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                              />
                              {baseResumeEdit ? (
                                <button
                                  onClick={() => removeSkill(index)}
                                  disabled={baseResumeLocked}
                                  className="text-xs text-red-500 hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  Remove
                                </button>
                              ) : null}
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

              </div>
            ) : null}
          </div>

          {addOpen && (
            <div
              className="fixed top-0 right-0 z-50 h-full w-full max-w-2xl transform border-l border-slate-200 bg-white shadow-2xl transition-transform duration-300"
            >
              <div className="flex h-full flex-col overflow-y-auto p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">Create profile</p>
                    <h1 className="text-2xl font-semibold text-slate-900">New profile</h1>
                    <p className="text-sm text-slate-600">Provide display name and optional contact info.</p>
                  </div>
                  <button
                    onClick={() => setAddOpen(false)}
                    className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                  >
                    Close
                  </button>
                </div>
                <div className="mt-6 grid gap-3 md:grid-cols-2">
                  <LabeledInput
                    label="Display name*"
                    value={createForm.displayName}
                    onChange={(v) => setCreateForm((f) => ({ ...f, displayName: v }))}
                  />
                  <LabeledInput
                    label="Email"
                    value={createForm.email}
                    onChange={(v) => setCreateForm((f) => ({ ...f, email: v }))}
                  />
                  <LabeledInput
                    label="First name"
                    value={createForm.firstName}
                    onChange={(v) => setCreateForm((f) => ({ ...f, firstName: v }))}
                  />
                  <LabeledInput
                    label="Last name"
                    value={createForm.lastName}
                    onChange={(v) => setCreateForm((f) => ({ ...f, lastName: v }))}
                  />
                  <LabeledInput
                    label="Phone code"
                    value={createForm.phoneCode}
                    onChange={(v) => setCreateForm((f) => ({ ...f, phoneCode: v }))}
                  />
                  <LabeledInput
                    label="Phone number"
                    value={createForm.phoneNumber}
                    onChange={(v) => setCreateForm((f) => ({ ...f, phoneNumber: v }))}
                  />
                  <LabeledInput
                    label="LinkedIn"
                    value={createForm.linkedin}
                    onChange={(v) => setCreateForm((f) => ({ ...f, linkedin: v }))}
                  />
                  <LabeledInput
                    label="Address"
                    value={createForm.address}
                    onChange={(v) => setCreateForm((f) => ({ ...f, address: v }))}
                  />
                  <LabeledInput
                    label="City"
                    value={createForm.city}
                    onChange={(v) => setCreateForm((f) => ({ ...f, city: v }))}
                  />
                  <LabeledInput
                    label="State/Province"
                    value={createForm.state}
                    onChange={(v) => setCreateForm((f) => ({ ...f, state: v }))}
                  />
                  <LabeledInput
                    label="Country"
                    value={createForm.country}
                    onChange={(v) => setCreateForm((f) => ({ ...f, country: v }))}
                  />
                  <LabeledInput
                    label="Postal code"
                    value={createForm.postalCode}
                    onChange={(v) => setCreateForm((f) => ({ ...f, postalCode: v }))}
                  />
                  <LabeledInput
                    label="Job title"
                    value={createForm.jobTitle}
                    onChange={(v) => setCreateForm((f) => ({ ...f, jobTitle: v }))}
                  />
                  <LabeledInput
                    label="Current company"
                    value={createForm.currentCompany}
                    onChange={(v) => setCreateForm((f) => ({ ...f, currentCompany: v }))}
                  />
                  <LabeledInput
                    label="Years of experience"
                    value={createForm.yearsExp}
                    onChange={(v) => setCreateForm((f) => ({ ...f, yearsExp: v }))}
                  />
                  <LabeledInput
                    label="Desired salary"
                    value={createForm.desiredSalary}
                    onChange={(v) => setCreateForm((f) => ({ ...f, desiredSalary: v }))}
                  />
                  <LabeledInput
                    label="School"
                    value={createForm.school}
                    onChange={(v) => setCreateForm((f) => ({ ...f, school: v }))}
                  />
                  <LabeledInput
                    label="Degree"
                    value={createForm.degree}
                    onChange={(v) => setCreateForm((f) => ({ ...f, degree: v }))}
                  />
                  <LabeledInput
                    label="Major / field"
                    value={createForm.majorField}
                    onChange={(v) => setCreateForm((f) => ({ ...f, majorField: v }))}
                  />
                  <LabeledInput
                    label="Graduation date"
                    value={createForm.graduationAt}
                    onChange={(v) => setCreateForm((f) => ({ ...f, graduationAt: v }))}
                  />
                </div>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    onClick={() => setAddOpen(false)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm text-slate-800 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateProfile}
                    disabled={creatingDisabled}
                    className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {createLoading ? "Creating..." : "Save profile"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {resumePreviewOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
              onClick={() => setResumePreviewOpen(false)}
            >
              <div
                className="max-h-[90vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                      Base resume
                    </p>
                    <h2 className="text-2xl font-semibold text-slate-900">Preview</h2>
                    {selectedProfile ? (
                      <p className="text-xs text-slate-500">
                        Profile: {selectedProfile.displayName}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleDownloadResumePdf}
                      disabled={resumePdfLoading || !resumePreviewHtml.trim()}
                      className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                    >
                      {resumePdfLoading ? "Saving..." : "Save PDF"}
                    </button>
                    <button
                      type="button"
                      onClick={() => router.push("/manager/resume-templates")}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      Manage templates
                    </button>
                    <button
                      type="button"
                      onClick={() => setResumePreviewOpen(false)}
                      className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                    >
                      Close
                    </button>
                  </div>
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Template
                  </div>
                  {resumeTemplatesLoading ? (
                    <div className="text-xs text-slate-500">Loading templates...</div>
                  ) : resumeTemplates.length === 0 ? (
                    <div className="text-xs text-slate-500">No templates yet.</div>
                  ) : (
                    <select
                      value={resumeTemplateId}
                      onChange={(event) => setResumeTemplateId(event.target.value)}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs text-slate-700"
                    >
                      {resumeTemplates.map((template) => (
                        <option key={template.id} value={template.id}>
                          {template.name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
                {resumeExportError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {resumeExportError}
                  </div>
                ) : null}
                {resumeTemplatesError ? (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {resumeTemplatesError}
                  </div>
                ) : null}

                <div className="mt-5 space-y-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-slate-500">
                    Template preview
                  </div>
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                    <iframe
                      title="Resume template preview"
                      srcDoc={resumePreviewDoc}
                      className="h-[520px] w-full"
                      sandbox=""
                      referrerPolicy="no-referrer"
                    />
                  </div>
                  <div className="text-xs text-slate-500">
                    Template bindings: {"{{Profile.name}}"}, {"{{Profile.headline}}"},
                    {"{{Profile.contact.email}}"}, {"{{Profile.contact.phone}}"},
                    {"{{Profile.contact.location}}"}, {"{{Profile.contact.linkedin}}"},
                    {"{{summary.text}}"}, {"{{#workExperience}}...{{/workExperience}}"},
                    {"{{#education}}...{{/education}}"}, {"{{#skills.raw}}...{{/skills.raw}}"}.
                  </div>
                </div>
              </div>
            </div>
          )}

          {detailOpen && (
            <div
              className="fixed inset-0 z-30 bg-black/30"
              onClick={() => {
                setDetailOpen(false);
                setSectionState(DEFAULT_SECTION_STATE);
              }}
            />
          )}
          {addOpen && (
            <div
              className="fixed inset-0 z-40 bg-black/30"
              onClick={() => setAddOpen(false)}
            />
          )}
        </section>
      </div>
    </ManagerShell>
  );

  function parseAssignError(err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (!message) return { message: "Failed to assign profile." };
    try {
      const parsed = JSON.parse(message) as { message?: string; assignmentId?: string };
      if (parsed?.message) return { message: parsed.message, assignmentId: parsed.assignmentId };
    } catch {
      // Non-JSON error text.
    }
    return { message };
  }

  async function handleAssign() {
    if (!selectedProfile || !assignBidderId || !token || !user) return;
    if (activeAssignment && activeAssignment.bidderUserId === assignBidderId) {
      setError("This profile is already assigned to the selected bidder.");
      return;
    }
    setAssignLoading(true);
    setError("");
    try {
      if (activeAssignment && activeAssignment.bidderUserId !== assignBidderId) {
        await api(`/assignments/${activeAssignment.id}/unassign`, { method: "POST", body: "{}" }, token);
      }
      await api(
        "/assignments",
        {
          method: "POST",
          body: JSON.stringify({
            profileId: selectedProfile.id,
            bidderUserId: assignBidderId,
            assignedBy: user.id,
          }),
        },
        token,
      );
      await loadAssignments(token);
    } catch (err) {
      console.error(err);
      const parsed = parseAssignError(err);
      if (parsed.message === "Profile already assigned") {
        await loadAssignments(token);
        setError("Profile already assigned. Use Unassign to change the bidder.");
      } else {
        setError(parsed.message || "Failed to assign profile.");
      }
    } finally {
      setAssignLoading(false);
    }
  }

  async function handleCreateProfile() {
    if (!token || !user) return;
    if (!createForm.displayName.trim()) return;
    setCreateLoading(true);
    setError("");
    try {
      const baseInfo = buildBaseInfoPayload({
        name: { first: createForm.firstName, last: createForm.lastName },
        contact: {
          email: createForm.email,
          phoneCode: createForm.phoneCode,
          phoneNumber: createForm.phoneNumber,
        },
        location: {
          address: createForm.address,
          city: createForm.city,
          state: createForm.state,
          country: createForm.country,
          postalCode: createForm.postalCode,
        },
        links: { linkedin: createForm.linkedin },
        career: {
          jobTitle: createForm.jobTitle,
          currentCompany: createForm.currentCompany,
          yearsExp: createForm.yearsExp,
          desiredSalary: createForm.desiredSalary,
        },
        education: {
          school: createForm.school,
          degree: createForm.degree,
          majorField: createForm.majorField,
          graduationAt: createForm.graduationAt,
        },
      });
      const created = await api<Profile>(
        "/profiles",
        {
          method: "POST",
          body: JSON.stringify({
            displayName: createForm.displayName.trim(),
            firstName: createForm.firstName.trim() || undefined,
            lastName: createForm.lastName.trim() || undefined,
            email: createForm.email.trim() || undefined,
            phoneCode: createForm.phoneCode.trim() || undefined,
            phoneNumber: createForm.phoneNumber.trim() || undefined,
            address: createForm.address.trim() || undefined,
            city: createForm.city.trim() || undefined,
            state: createForm.state.trim() || undefined,
            country: createForm.country.trim() || undefined,
            postalCode: createForm.postalCode.trim() || undefined,
            linkedin: createForm.linkedin.trim() || undefined,
            jobTitle: createForm.jobTitle.trim() || undefined,
            currentCompany: createForm.currentCompany.trim() || undefined,
            yearsExp: createForm.yearsExp.trim() || undefined,
            desiredSalary: createForm.desiredSalary.trim() || undefined,
            school: createForm.school.trim() || undefined,
            degree: createForm.degree.trim() || undefined,
            majorField: createForm.majorField.trim() || undefined,
            graduationAt: createForm.graduationAt.trim() || undefined,
            baseInfo,
          }),
        },
        token,
      );
      await loadProfiles(token);
      setSelectedId(created.id);
      setDetailOpen(true);
      setAddOpen(false);
      setCreateForm(getEmptyCreateForm());
    } catch (err) {
      console.error(err);
      setError("Failed to create profile.");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleUnassign(assignmentId: string) {
    if (!token) return;
    setAssignLoading(true);
    setError("");
    try {
      await api(`/assignments/${assignmentId}/unassign`, { method: "POST", body: "{}" }, token);
      await loadAssignments(token);
      setAssignBidderId(bidders[0]?.id ?? "");
    } catch (err) {
      console.error(err);
      setError("Failed to unassign profile.");
    } finally {
      setAssignLoading(false);
    }
  }

function updateBase(path: string, value: string | boolean) {
  setDraftBase((prev) => {
    const next = cleanBaseInfo(prev);
    switch (path) {
      case "name.first":
        next.name = { ...next.name, first: String(value) };
        break;
      case "name.last":
        next.name = { ...next.name, last: String(value) };
        break;
      case "contact.email":
        next.contact = { ...next.contact, email: String(value) };
        break;
      case "contact.phoneCode":
        next.contact = { ...next.contact, phoneCode: String(value) };
        break;
      case "contact.phoneNumber":
        next.contact = { ...next.contact, phoneNumber: String(value) };
        break;
      case "links.linkedin":
        next.links = { ...(next.links ?? {}), linkedin: String(value) };
        break;
      case "location.address":
        next.location = { ...next.location, address: String(value) };
        break;
      case "location.city":
        next.location = { ...next.location, city: String(value) };
        break;
      case "location.state":
        next.location = { ...next.location, state: String(value) };
        break;
      case "location.country":
        next.location = { ...next.location, country: String(value) };
        break;
      case "location.postalCode":
        next.location = { ...next.location, postalCode: String(value) };
        break;
      case "career.jobTitle":
        next.career = { ...next.career, jobTitle: String(value) };
        break;
      case "career.currentCompany":
        next.career = { ...next.career, currentCompany: String(value) };
        break;
      case "career.yearsExp":
        next.career = { ...next.career, yearsExp: String(value) };
        break;
      case "career.desiredSalary":
        next.career = { ...next.career, desiredSalary: String(value) };
        break;
      case "education.school":
        next.education = { ...next.education, school: String(value) };
        break;
      case "education.degree":
        next.education = { ...next.education, degree: String(value) };
        break;
      case "education.majorField":
        next.education = { ...next.education, majorField: String(value) };
        break;
      case "education.graduationAt":
        next.education = { ...next.education, graduationAt: String(value) };
        break;
      case "workAuth.authorized":
        next.workAuth = { ...(next.workAuth ?? {}), authorized: Boolean(value) };
        break;
      default:
        break;
    }
    if (path.startsWith("contact.")) {
      next.contact = { ...(next.contact ?? {}), phone: formatPhone(next.contact) };
    }
    return next;
  });
}

}

function SectionHeader({
  title,
  state,
  onToggleShow,
  onEdit,
  onSave,
  onCancel,
}: {
  title: string;
  state: { show: boolean; edit: boolean };
  onToggleShow: () => void;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="md:col-span-2 flex items-center justify-between pt-1">
      <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{title}</div>
      <div className="flex items-center gap-2 text-xs">
        <IconButton onClick={onToggleShow} title={state.show ? "Hide section" : "Show section"}>
          <TriangleIcon direction={state.show ? "down" : "left"} />
          <span className={srOnly}>{state.show ? "Hide" : "Show"}</span>
        </IconButton>
        {state.edit ? (
          <>
            <IconButton onClick={onSave} title="Save section">
              <CheckIcon />
              <span className={srOnly}>Save</span>
            </IconButton>
            <IconButton onClick={onCancel} title="Cancel editing">
              <CloseIcon />
              <span className={srOnly}>Cancel</span>
            </IconButton>
          </>
        ) : (
          <IconButton onClick={onEdit} title="Edit section">
            <PenIcon />
            <span className={srOnly}>Edit</span>
          </IconButton>
        )}
      </div>
    </div>
  );
}

function IconButton({
  onClick,
  title,
  children,
}: {
  onClick: MouseEventHandler<HTMLButtonElement>;
  title: string;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      type="button"
      className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:bg-slate-100"
    >
      {children}
    </button>
  );
}


function TriangleIcon({ direction }: { direction: "down" | "left" }) {
  const rotation = direction === "down" ? "rotate-0" : "rotate-90";
  return (
    <svg
      viewBox="0 0 24 24"
      className={`h-4 w-4 fill-current ${rotation}`}
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 16.5 5 7.5h14z" />
    </svg>
  );
}

function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true" focusable="false">
      <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm18-10.5a1.06 1.06 0 0 0 0-1.5L18.75 3a1.06 1.06 0 0 0-1.5 0l-1.88 1.88 3.75 3.75L21 6.75z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true" focusable="false">
      <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true" focusable="false">
      <path d="M6.225 4.811 4.81 6.225 10.586 12l-5.775 5.775 1.414 1.414L12 13.414l5.775 5.775 1.414-1.414L13.414 12l5.775-5.775-1.414-1.414L12 10.586z" />
    </svg>
  );
}

function cleanBaseInfo(base: BaseInfo): BaseInfo {
  return {
    name: { first: cleanString(base?.name?.first), last: cleanString(base?.name?.last) },
    contact: {
      email: cleanString(base?.contact?.email),
      phone: formatPhone(base?.contact),
      phoneCode: cleanString(base?.contact?.phoneCode),
      phoneNumber: cleanString(base?.contact?.phoneNumber),
    },
    location: {
      address: cleanString(base?.location?.address),
      city: cleanString(base?.location?.city),
      state: cleanString(base?.location?.state),
      country: cleanString(base?.location?.country),
      postalCode: cleanString(base?.location?.postalCode),
    },
    links: { ...(base?.links ?? {}), linkedin: cleanString(base?.links?.linkedin) },
    career: {
      jobTitle: cleanString(base?.career?.jobTitle),
      currentCompany: cleanString(base?.career?.currentCompany),
      yearsExp: cleanString(base?.career?.yearsExp as string | number | undefined),
      desiredSalary: cleanString(base?.career?.desiredSalary),
    },
    education: {
      school: cleanString(base?.education?.school),
      degree: cleanString(base?.education?.degree),
      majorField: cleanString(base?.education?.majorField),
      graduationAt: cleanString(base?.education?.graduationAt),
    },
    workAuth: { authorized: base?.workAuth?.authorized ?? false, needsSponsorship: base?.workAuth?.needsSponsorship ?? false },
    preferences: base?.preferences ?? {},
    defaultAnswers: base?.defaultAnswers ?? {},
  };
}

function buildBaseInfoPayload(base: BaseInfo): BaseInfo {
  const cleaned = cleanBaseInfo(base);
  return {
    ...cleaned,
    contact: { ...cleaned.contact, phone: formatPhone(cleaned.contact) },
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getEmptyWorkExperience(): WorkExperience {
  return {
    companyTitle: "",
    roleTitle: "",
    employmentType: "",
    location: "",
    startDate: "",
    endDate: "",
    bullets: [""],
  };
}

function getEmptyEducation(): EducationEntry {
  return {
    institution: "",
    degree: "",
    field: "",
    date: "",
    coursework: [""],
  };
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [""];
  const cleaned = value.map((item) => cleanString(item as string | number | null));
  return cleaned.length ? cleaned : [""];
}

function normalizeWorkExperience(value: unknown): WorkExperience {
  const source = isPlainObject(value) ? value : {};
  return {
    companyTitle: cleanString(source.companyTitle as string | number | null),
    roleTitle: cleanString(source.roleTitle as string | number | null),
    employmentType: cleanString(source.employmentType as string | number | null),
    location: cleanString(source.location as string | number | null),
    startDate: cleanString(source.startDate as string | number | null),
    endDate: cleanString(source.endDate as string | number | null),
    bullets: normalizeStringList(source.bullets),
  };
}

function normalizeEducation(value: unknown): EducationEntry {
  const source = isPlainObject(value) ? value : {};
  return {
    institution: cleanString(source.institution as string | number | null),
    degree: cleanString(source.degree as string | number | null),
    field: cleanString(source.field as string | number | null),
    date: cleanString(source.date as string | number | null),
    coursework: normalizeStringList(source.coursework),
  };
}

function getEmptyBaseResume(): BaseResume {
  return {
    Profile: {
      name: "",
      headline: "",
      contact: {
        location: "",
        email: "",
        phone: "",
        linkedin: "",
      },
    },
    summary: { text: "" },
    workExperience: [getEmptyWorkExperience()],
    education: [getEmptyEducation()],
    skills: { raw: [""] },
  };
}

function normalizeBaseResume(value?: BaseResume): BaseResume {
  if (!isPlainObject(value)) return getEmptyBaseResume();
  const profileInput = isPlainObject(value.Profile) ? value.Profile : {};
  const contactInput = isPlainObject(profileInput.contact) ? profileInput.contact : {};
  const summaryInput = isPlainObject(value.summary) ? value.summary : {};
  const workExperience =
    Array.isArray(value.workExperience) && value.workExperience.length
      ? value.workExperience.map(normalizeWorkExperience)
      : [getEmptyWorkExperience()];
  const education =
    Array.isArray(value.education) && value.education.length
      ? value.education.map(normalizeEducation)
      : [getEmptyEducation()];
  const skillsInput = isPlainObject(value.skills) ? value.skills : {};

  return {
    Profile: {
      name: cleanString(profileInput.name as string | number | null),
      headline: cleanString(profileInput.headline as string | number | null),
      contact: {
        location: cleanString(contactInput.location as string | number | null),
        email: cleanString(contactInput.email as string | number | null),
        phone: cleanString(contactInput.phone as string | number | null),
        linkedin: cleanString(contactInput.linkedin as string | number | null),
      },
    },
    summary: { text: cleanString(summaryInput.text as string | number | null) },
    workExperience,
    education,
    skills: { raw: normalizeStringList(skillsInput.raw) },
  };
}

function parseBaseResumeText(text: string): BaseResume {
  const parsed = JSON.parse(text) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Base resume JSON must be an object.");
  }
  return parsed as BaseResume;
}

function serializeBaseResume(value?: BaseResume): string {
  return JSON.stringify(normalizeBaseResume(value));
}

function syncOpenList(list: boolean[], length: number): boolean[] {
  if (length <= 0) return [];
  return Array.from({ length }, (_, index) => list[index] ?? true);
}

function cleanString(val?: string | number | null) {
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val.trim();
  return "";
}

function formatPhone(contact?: BaseInfo["contact"]) {
  if (!contact) return "";
  const parts = [contact.phoneCode, contact.phoneNumber]
    .map((p) => cleanString(p))
    .filter(Boolean);
  const combined = parts.join(" ").trim();
  const fallback = cleanString(contact.phone);
  return combined || fallback;
}

function getEmptyCreateForm() {
  return {
    displayName: "",
    firstName: "",
    lastName: "",
    email: "",
    phoneCode: "",
    phoneNumber: "",
    address: "",
    city: "",
    state: "",
    country: "",
    postalCode: "",
    linkedin: "",
    jobTitle: "",
    currentCompany: "",
    yearsExp: "",
    desiredSalary: "",
    school: "",
    degree: "",
    majorField: "",
    graduationAt: "",
  };
}

function LabeledInput({
  label,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs uppercase tracking-[0.18em] text-slate-600">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
      />
    </label>
  );
}

function ReadRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
      <div className="text-xs uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-slate-900">{value || "-"}</div>
    </div>
  );
}

function hasWorkExperience(item: WorkExperience) {
  if (!item) return false;
  const fields = [
    cleanString(item.companyTitle),
    cleanString(item.roleTitle),
    cleanString(item.employmentType),
    cleanString(item.location),
    cleanString(item.startDate),
    cleanString(item.endDate),
  ];
  if (fields.some(Boolean)) return true;
  return (item.bullets ?? []).some((bullet) => cleanString(bullet));
}

function hasEducationEntry(item: EducationEntry) {
  if (!item) return false;
  const fields = [
    cleanString(item.institution),
    cleanString(item.degree),
    cleanString(item.field),
    cleanString(item.date),
  ];
  if (fields.some(Boolean)) return true;
  return (item.coursework ?? []).some((course) => cleanString(course));
}

function renderResumeTemplate(templateHtml: string, resume: BaseResume) {
  if (!templateHtml.trim()) return "";
  const data = buildTemplateData(resume);
  return renderMustacheTemplate(templateHtml, data);
}

type SafeHtml = { __html: string };

function safeHtml(value: string): SafeHtml {
  return { __html: value };
}

function isSafeHtml(value: unknown): value is SafeHtml {
  return Boolean(value && typeof value === "object" && "__html" in (value as SafeHtml));
}

function buildTemplateData(resume: BaseResume) {
  const profile = resume.Profile ?? {};
  const summary = resume.summary ?? {};
  const skills = resume.skills ?? {};
  return {
    ...resume,
    Profile: profile,
    profile,
    summary,
    skills,
    work_experience: safeHtml(buildWorkExperienceHtml(resume.workExperience)),
  };
}

function buildWorkExperienceHtml(items?: WorkExperience[]) {
  const list = (items ?? []).filter(hasWorkExperience);
  if (!list.length) return "";
  return list
    .map((item, index) => {
      const title = [item.roleTitle, item.companyTitle]
        .map(cleanString)
        .filter(Boolean)
        .join(" - ");
      const dates = [item.startDate, item.endDate]
        .map(cleanString)
        .filter(Boolean)
        .join(" - ");
      const meta = [item.location, item.employmentType]
        .map(cleanString)
        .filter(Boolean)
        .join(" | ");
      const bullets = (item.bullets ?? []).map(cleanString).filter(Boolean);
      const bulletHtml = bullets.length
        ? `<ul>${bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}</ul>`
        : "";
      const header = escapeHtml(title || `Role ${index + 1}`);
      const datesHtml = dates ? `<div class="resume-meta">${escapeHtml(dates)}</div>` : "";
      const metaHtml = meta ? `<div class="resume-meta">${escapeHtml(meta)}</div>` : "";
      return `<div class="resume-item"><div><strong>${header}</strong></div>${datesHtml}${metaHtml}${bulletHtml}</div>`;
    })
    .join("");
}

function buildEducationHtml(items?: EducationEntry[]) {
  const list = (items ?? []).filter(hasEducationEntry);
  if (!list.length) return "";
  return list
    .map((item, index) => {
      const title = [item.degree, item.field].map(cleanString).filter(Boolean).join(" - ");
      const header = [item.institution, title].map(cleanString).filter(Boolean).join(" | ");
      const date = cleanString(item.date);
      const coursework = (item.coursework ?? []).map(cleanString).filter(Boolean);
      const courseworkText = coursework.length ? `Coursework: ${coursework.join(", ")}` : "";
      const dateHtml = date ? `<div class="resume-meta">${escapeHtml(date)}</div>` : "";
      const courseworkHtml = courseworkText
        ? `<div class="resume-meta">${escapeHtml(courseworkText)}</div>`
        : "";
      const label = escapeHtml(header || `Education ${index + 1}`);
      return `<div class="resume-item"><div><strong>${label}</strong></div>${dateHtml}${courseworkHtml}</div>`;
    })
    .join("");
}

function renderMustacheTemplate(template: string, data: Record<string, unknown>) {
  return renderTemplateWithContext(template, [data]);
}

function renderTemplateWithContext(template: string, stack: unknown[]): string {
  let output = "";
  let index = 0;

  while (index < template.length) {
    const openIndex = template.indexOf("{{", index);
    if (openIndex === -1) {
      output += template.slice(index);
      break;
    }
    output += template.slice(index, openIndex);
    const closeIndex = template.indexOf("}}", openIndex + 2);
    if (closeIndex === -1) {
      output += template.slice(openIndex);
      break;
    }
    const tag = template.slice(openIndex + 2, closeIndex).trim();
    index = closeIndex + 2;
    if (!tag) continue;

    const type = tag[0];
    if (type === "#" || type === "^") {
      const name = tag.slice(1).trim();
      if (!name) continue;
      const section = findSectionEnd(template, index, name);
      if (!section) continue;
      const inner = template.slice(index, section.start);
      index = section.end;
      const value = resolvePath(name, stack);
      const truthy = isSectionTruthy(value);

      if (type === "#") {
        if (Array.isArray(value)) {
          if (value.length) {
            value.forEach((item) => {
              output += renderTemplateWithContext(inner, pushContext(stack, item));
            });
          }
        } else if (truthy) {
          output += renderTemplateWithContext(inner, pushContext(stack, value));
        }
      } else if (!truthy) {
        output += renderTemplateWithContext(inner, stack);
      }
      continue;
    }

    if (type === "/") {
      continue;
    }

    const value = resolvePath(tag, stack);
    output += renderValue(value, tag);
  }

  return output;
}

function findSectionEnd(template: string, fromIndex: number, name: string) {
  let index = fromIndex;
  let depth = 1;
  while (index < template.length) {
    const openIndex = template.indexOf("{{", index);
    if (openIndex === -1) return null;
    const closeIndex = template.indexOf("}}", openIndex + 2);
    if (closeIndex === -1) return null;
    const tag = template.slice(openIndex + 2, closeIndex).trim();
    index = closeIndex + 2;
    if (!tag) continue;
    const type = tag[0];
    const tagName =
      type === "#" || type === "^" || type === "/" ? tag.slice(1).trim() : "";
    if (!tagName) continue;
    if ((type === "#" || type === "^") && tagName === name) {
      depth += 1;
    }
    if (type === "/" && tagName === name) {
      depth -= 1;
      if (depth === 0) {
        return { start: openIndex, end: closeIndex + 2 };
      }
    }
  }
  return null;
}

function resolvePath(path: string, stack: unknown[]) {
  if (path === ".") return resolveDot(stack);
  const parts = path.split(".");
  for (let i = 0; i < stack.length; i += 1) {
    const value = getPathValue(stack[i], parts);
    if (value !== undefined) return value;
  }
  return undefined;
}

function resolveDot(stack: unknown[]) {
  for (let i = 0; i < stack.length; i += 1) {
    const ctx = stack[i];
    if (ctx && typeof ctx === "object" && "." in (ctx as Record<string, unknown>)) {
      return (ctx as Record<string, unknown>)["."];
    }
    if (typeof ctx === "string" || typeof ctx === "number" || typeof ctx === "boolean") {
      return ctx;
    }
  }
  return undefined;
}

function getPathValue(context: unknown, parts: string[]) {
  if (!context || typeof context !== "object") return undefined;
  let current: any = context;
  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) return undefined;
    current = current[part];
  }
  return current;
}

function pushContext(stack: unknown[], value: unknown) {
  if (value === null || value === undefined) return stack;
  if (value && typeof value === "object") {
    return [value, ...stack];
  }
  return [{ ".": value }, ...stack];
}

function isSectionTruthy(value: unknown) {
  if (Array.isArray(value)) return value.length > 0;
  if (isSafeHtml(value)) return Boolean(value.__html);
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "object") return true;
  return Boolean(value);
}

function renderValue(value: unknown, path: string) {
  if (isSafeHtml(value)) return value.__html;
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) {
    if (path === "workExperience" || path === "work_experience") {
      return buildWorkExperienceHtml(value as WorkExperience[]);
    }
    if (path === "education") {
      return buildEducationHtml(value as EducationEntry[]);
    }
    if (path === "skills.raw") {
      const joined = value.map((item) => cleanString(item as string)).filter(Boolean).join(", ");
      return escapeHtml(joined);
    }
    const joined = value.map((item) => cleanString(item as string)).filter(Boolean).join(", ");
    return escapeHtml(joined);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.text === "string") return escapeHtml(record.text);
    if (Array.isArray(record.raw)) {
      const joined = record.raw.map((item) => cleanString(item as string)).filter(Boolean).join(", ");
      return escapeHtml(joined);
    }
    return "";
  }
  if (typeof value === "boolean") return value ? "true" : "";
  return escapeHtml(String(value));
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildResumePdfName(profileName?: string, templateName?: string) {
  const base = [profileName, templateName, "resume"].filter(Boolean).join("-");
  const cleaned = base
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "resume";
}

function getPdfFilenameFromHeader(header: string | null) {
  if (!header) return "";
  const match = header.match(/filename=\"?([^\";]+)\"?/i);
  return match ? match[1] : "";
}

function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        resolve(result);
      } else {
        reject(new Error("Unable to read file"));
      }
    };
    reader.onerror = reject;
    reader.readAsText(file);
  });
}
