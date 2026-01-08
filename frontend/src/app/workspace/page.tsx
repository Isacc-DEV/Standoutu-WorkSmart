'use client';
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import TopNav from "../../components/TopNav";
import { API_BASE } from "@/lib/api";

const CONNECT_TIMEOUT_MS = 20000;
const CHECK_TIMEOUT_MS = 10000;
const TAILOR_TIMEOUT_MS = 20000;
const EMPTY_RESUME_PREVIEW = `<!doctype html>
<html>
<body style="font-family: Arial, sans-serif; padding: 24px; color: #475569;">
  <div style="max-width: 520px;">
    <h2 style="margin: 0 0 8px; font-size: 18px;">Resume preview</h2>
    <p style="margin: 0; font-size: 13px; line-height: 1.5;">
      Generate a tailored resume to see the template preview.
    </p>
  </div>
</body>
</html>`;
type DesktopBridge = {
  isElectron?: boolean;
  openJobWindow?: (url: string) => Promise<{ ok?: boolean; error?: string } | void>;
};

type WebviewHandle = HTMLElement & {
  executeJavaScript: (code: string, userGesture?: boolean) => Promise<unknown>;
  addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => void;
  loadURL?: (url: string) => Promise<void> | void;
};

type User = {
  id: string;
  email: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "BIDDER" | "OBSERVER";
};

type BaseInfo = {
  name?: { first?: string; last?: string };
  contact?: { email?: string; phone?: string; phoneCode?: string; phoneNumber?: string };
  links?: Record<string, string> & { linkedin?: string };
  location?: { address?: string; city?: string; state?: string; country?: string; postalCode?: string };
  career?: { jobTitle?: string; currentCompany?: string; yearsExp?: string | number; desiredSalary?: string };
  education?: { school?: string; degree?: string; majorField?: string; graduationAt?: string };
  workAuth?: { authorized?: boolean; needsSponsorship?: boolean };
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

type WorkExperience = NonNullable<BaseResume["workExperience"]>[number];
type EducationEntry = NonNullable<BaseResume["education"]>[number];

type Profile = {
  id: string;
  displayName: string;
  baseInfo: BaseInfo;
  baseResume?: BaseResume;
  assignedBidderId?: string;
};

type ResumeTemplate = {
  id: string;
  name: string;
  description?: string | null;
  html: string;
  createdAt: string;
  updatedAt: string;
};

type TailorResumeResponse = {
  content?: string;
  parsed?: unknown;
  provider?: string;
  model?: string;
};

type BulletAugmentation = {
  first_company?: string[];
  second_company?: string[];
  other_companies?: Array<{
    experience_index?: number | string;
    bullets?: string[];
  }>;
};

type CompanyBulletMap = Record<string, string[]>;

type ApplicationSession = {
  id: string;
  bidderUserId: string;
  profileId: string;
  url: string;
  status: string;
  jobContext?: Record<string, unknown>;
  fillPlan?: FillPlan;
  startedAt?: string;
};

type FillPlan = {
  filled?: { field: string; value: string; confidence?: number }[];
  suggestions?: { field: string; suggestion: string }[];
  blocked?: string[];
  actions?: FillPlanAction[];
};

type FillPlanAction = {
  field?: string;
  field_id?: string;
  label?: string;
  selector?: string | null;
  action?: "fill" | "select" | "check" | "uncheck" | "click" | "upload" | "skip";
  value?: string;
  confidence?: number;
};

type PageFieldCandidate = {
  field_id?: string;
  id?: string | null;
  name?: string | null;
  label?: string | null;
  ariaName?: string | null;
  placeholder?: string | null;
  questionText?: string | null;
  type?: string | null;
  selector?: string | null;
  locators?: { css?: string; playwright?: string };
  constraints?: Record<string, number>;
  required?: boolean;
};

type AutofillResponse = {
  fillPlan: FillPlan;
  pageFields?: PageFieldCandidate[];
  candidateFields?: PageFieldCandidate[];
};

type ApplicationPhraseResponse = {
  phrases: string[];
};

type Metrics = {
  tried: number;
  submitted: number;
  appliedPercentage: number;
  monthlyApplied?: number;
  recent: ApplicationSession[];
};

async function api(path: string, init?: RequestInit) {
  const token =
    typeof window !== "undefined" ? window.localStorage.getItem("smartwork_token") : null;
  const headers: Record<string, string> = {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(init?.headers as Record<string, string> | undefined),
  };
  if (init?.body && !headers["Content-Type"]) {
    headers["Content-Type"] = "application/json";
  }
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
      cache: "no-store",
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`Network error contacting API (${API_BASE || "unknown"}): ${message}`);
  }
  if (!res.ok) {
    if (res.status === 401) {
      if (typeof window !== "undefined") {
        window.localStorage.removeItem("smartwork_token");
        window.localStorage.removeItem("smartwork_user");
        window.location.href = "/auth";
      }
      throw new Error("Unauthorized");
    }
    const text = await res.text();
    let message = text || res.statusText;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed?.message) message = parsed.message;
    } catch {
      // Ignore JSON parse errors and show raw text.
    }
    throw new Error(message);
  }
  return res.json();
}

export default function Page() {
  const [user, setUser] = useState<User | null>(null);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("");
  const [url, setUrl] = useState<string>(
    "https://www.wave.com/en/careers/job/5725498004/?source=LinkedIn"
  );
  const [useLlmAutofill, setUseLlmAutofill] = useState(false);
  const [applicationPhrases, setApplicationPhrases] = useState<string[]>([]);
  const [checkEnabled, setCheckEnabled] = useState(false);
  const [session, setSession] = useState<ApplicationSession | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [fillPlan, setFillPlan] = useState<FillPlan | null>(null);
  const [capturedFields, setCapturedFields] = useState<PageFieldCandidate[]>([]);
  const [frameLoaded, setFrameLoaded] = useState(false);
  const [streamFrame, setStreamFrame] = useState<string>("");
  const [status, setStatus] = useState<string>("Disconnected");
  const [loadingAction, setLoadingAction] = useState<string>("");
  const [streamConnected, setStreamConnected] = useState(false);
  const [showBaseInfo, setShowBaseInfo] = useState(false);
  const [baseInfoView, setBaseInfoView] = useState<BaseInfo>(() => cleanBaseInfo({}));
  const [webviewStatus, setWebviewStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const [resumeTemplates, setResumeTemplates] = useState<ResumeTemplate[]>([]);
  const [resumeTemplatesLoading, setResumeTemplatesLoading] = useState(false);
  const [resumeTemplatesError, setResumeTemplatesError] = useState("");
  const [resumeTemplateId, setResumeTemplateId] = useState("");
  const [resumePreviewOpen, setResumePreviewOpen] = useState(false);
  const [jdPreviewOpen, setJdPreviewOpen] = useState(false);
  const [jdSelectionMode, setJdSelectionMode] = useState(false);
  const [jdDraft, setJdDraft] = useState("");
  const [jdCaptureLoading, setJdCaptureLoading] = useState(false);
  const [jdCaptureError, setJdCaptureError] = useState("");
  const [tailorLoading, setTailorLoading] = useState(false);
  const [tailorError, setTailorError] = useState("");
  const [tailorPdfLoading, setTailorPdfLoading] = useState(false);
  const [tailorPdfError, setTailorPdfError] = useState("");
  const [tailoredResume, setTailoredResume] = useState<BaseResume | null>(null);
  const [llmRawOutput, setLlmRawOutput] = useState("");
  const [llmMeta, setLlmMeta] = useState<{ provider?: string; model?: string } | null>(null);
  const [aiProvider, setAiProvider] = useState<"HUGGINGFACE" | "OPENAI" | "GEMINI">(
    "HUGGINGFACE"
  );
  const jdSelectionPollRef = useRef<number | null>(null);
  const jdDraftRef = useRef("");
  const jdPreviewOpenRef = useRef(false);
  const jdSelectionModeRef = useRef(false);
  const webviewRef = useRef<WebviewHandle | null>(null);
  const [isClient, setIsClient] = useState(false);
  const router = useRouter();
  const showError = useCallback((message: string) => {
    if (!message) return;
    if (typeof window !== "undefined") {
      window.alert(message);
    }
  }, []);
  const isBidder = user?.role === "BIDDER";
  const browserSrc = session?.url || url || "";
  const webviewPartition = "persist:smartwork-jobview";

  useEffect(() => {
    setIsClient(true);
  }, []);

  useEffect(() => {
    if (!isClient || typeof window === "undefined") return;
    const storedProvider = window.localStorage.getItem("smartwork_ai_provider") ?? "";
    if (
      storedProvider === "OPENAI" ||
      storedProvider === "HUGGINGFACE" ||
      storedProvider === "GEMINI"
    ) {
      setAiProvider(storedProvider);
    }
  }, [isClient]);

  useEffect(() => {
    if (!isClient || typeof window === "undefined") return;
    window.localStorage.setItem("smartwork_ai_provider", aiProvider);
  }, [aiProvider, isClient]);

  useEffect(() => {
    jdDraftRef.current = jdDraft;
  }, [jdDraft]);

  useEffect(() => {
    jdPreviewOpenRef.current = jdPreviewOpen;
  }, [jdPreviewOpen]);

  useEffect(() => {
    jdSelectionModeRef.current = jdSelectionMode;
  }, [jdSelectionMode]);

  useEffect(() => {
    return () => {
      if (jdSelectionPollRef.current !== null) {
        window.clearInterval(jdSelectionPollRef.current);
        jdSelectionPollRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isClient) return;
    const stored = window.localStorage.getItem("smartwork_user");
    const storedToken = window.localStorage.getItem("smartwork_token");
    if (stored && storedToken) {
      try {
        const parsed = JSON.parse(stored) as User;
        setUser(parsed);
      } catch {
        router.replace("/auth");
      }
    } else {
      router.replace("/auth");
    }
  }, [isClient, router]);

  useEffect(() => {
    if (!user) return;
    const loadPhrases = async () => {
      try {
        const data = (await api("/application-phrases")) as ApplicationPhraseResponse;
        if (data?.phrases?.length) {
          setApplicationPhrases(data.phrases);
        }
      } catch (err) {
        console.error("Failed to load application phrases", err);
      }
    };
    void loadPhrases();
  }, [user]);

  const loadResumeTemplates = useCallback(async () => {
    setResumeTemplatesLoading(true);
    setResumeTemplatesError("");
    try {
      const list = (await api("/resume-templates")) as ResumeTemplate[];
      setResumeTemplates(list);
    } catch (err) {
      console.error(err);
      setResumeTemplatesError("Failed to load resume templates.");
    } finally {
      setResumeTemplatesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user || user.role === "OBSERVER") return;
    void loadResumeTemplates();
  }, [user, loadResumeTemplates]);

  const desktopBridge: DesktopBridge | undefined =
    isClient && typeof window !== "undefined"
      ? (window as unknown as { smartwork?: DesktopBridge }).smartwork
      : undefined;
  const isElectron = isClient && Boolean(desktopBridge?.openJobWindow);

  const selectedProfile = useMemo(
    () => profiles.find((p) => p.id === selectedProfileId),
    [profiles, selectedProfileId]
  );
  const baseResumeView = useMemo(
    () => normalizeBaseResume(selectedProfile?.baseResume),
    [selectedProfile]
  );
  const selectedTemplate = useMemo(
    () => resumeTemplates.find((template) => template.id === resumeTemplateId),
    [resumeTemplates, resumeTemplateId]
  );
  const resumePreviewHtml = useMemo(() => {
    if (!selectedTemplate || !tailoredResume) return "";
    return renderResumeTemplate(selectedTemplate.html, tailoredResume);
  }, [selectedTemplate, tailoredResume]);
  const resumePreviewDoc = useMemo(() => {
    const html = resumePreviewHtml.trim();
    return html ? html : EMPTY_RESUME_PREVIEW;
  }, [resumePreviewHtml]);

  const appliedPct = metrics ? `${metrics.appliedPercentage}%` : "0%";
  const monthlyApplied = metrics?.monthlyApplied ?? 0;
  const baseDraft = cleanBaseInfo(baseInfoView);
  const normalizedCheckPhrases = useMemo(() => {
    const merged = new Map<string, string>();
    applicationPhrases.forEach((phrase) => {
      const normalized = normalizeTextForMatch(phrase);
      if (!normalized) return;
      const squished = normalized.replace(/\s+/g, "");
      merged.set(normalized, squished);
    });
    return Array.from(merged.entries()).map(([normalized, squished]) => ({
      normalized,
      squished,
    }));
  }, [applicationPhrases]);
  const canCheck =
    isElectron &&
    Boolean(session) &&
    checkEnabled &&
    session?.status !== "SUBMITTED" &&
    loadingAction !== "check" &&
    loadingAction !== "go";

  const refreshMetrics = useCallback(
    async (bidderId?: string) => {
      if (!bidderId && !user) return;
      const id = bidderId ?? user?.id;
      if (!id) return;
      try {
        const m: Metrics = await api(`/metrics/my?bidderUserId=${id}`);
        setMetrics(m);
      } catch (err) {
        console.error(err);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!selectedProfileId || !user) return;
    setSession(null);
    setFillPlan(null);
    setCapturedFields([]);
    setStreamFrame("");
    setStreamConnected(false);
    setCheckEnabled(false);
    const base = profiles.find((p) => p.id === selectedProfileId)?.baseInfo;
    setBaseInfoView(cleanBaseInfo(base ?? {}));
    setShowBaseInfo(false);
  }, [selectedProfileId, user, profiles]);

  useEffect(() => {
    setTailoredResume(null);
    setTailorError("");
    setTailorPdfError("");
    setResumePreviewOpen(false);
    setJdPreviewOpen(false);
    setJdDraft("");
    setJdCaptureError("");
    setLlmRawOutput("");
    setLlmMeta(null);
  }, [selectedProfileId]);

  useEffect(() => {
    if (!resumeTemplates.length) {
      setResumeTemplateId("");
      return;
    }
    if (!resumeTemplateId || !resumeTemplates.some((t) => t.id === resumeTemplateId)) {
      setResumeTemplateId(resumeTemplates[0].id);
    }
  }, [resumeTemplates, resumeTemplateId]);

  const sessionId = session?.id;

  useEffect(() => {
    if (!sessionId) {
      setStreamFrame("");
      setStreamConnected(false);
      setFrameLoaded(false);
      setCheckEnabled(false);
      return;
    }
    setStreamConnected(false);
    setStreamFrame("");
    setFrameLoaded(false);
    const base = API_BASE.startsWith("http") ? API_BASE : window.location.origin;
    const wsBase = base.replace(/^http/i, "ws");
    const ws = new WebSocket(`${wsBase}/ws/browser/${sessionId}`);
    ws.onopen = () => setStreamConnected(true);
    ws.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data as string);
        if (msg.type === "frame" && msg.data) {
          setStreamFrame(`data:image/png;base64,${msg.data}`);
          setFrameLoaded(true);
        }
      } catch (err) {
        console.error(err);
      }
    };
    ws.onerror = () => setStreamConnected(false);
    ws.onclose = () => setStreamConnected(false);
    return () => {
      ws.close();
    };
  }, [sessionId]);

  useEffect(() => {
    setWebviewStatus("idle");
    setCheckEnabled(false);
  }, [url]);

  useEffect(() => {
    if (!isElectron) return;
    setWebviewStatus("loading");
    setCheckEnabled(false);
  }, [browserSrc, isElectron]);

  useEffect(() => {
    if (!isElectron || !webviewRef.current || !browserSrc) return;
    const view = webviewRef.current;
    const handleReady = () => {
      setWebviewStatus("ready");
      setCheckEnabled(true);
    };
    const handleDomReady = () => {
      setWebviewStatus("ready");
      setCheckEnabled(true);
    };
    const handleStop = () => {
      setWebviewStatus("ready");
      setCheckEnabled(true);
    };
    const handleFail = () => {
      setWebviewStatus("failed");
      setCheckEnabled(false);
    };
    const handleStart = () => {
      setWebviewStatus("loading");
      setCheckEnabled(false);
    };
    const handleNewWindow = (event: Event) => {
      const popup = event as Event & { url?: string; preventDefault?: () => void };
      if (typeof popup.preventDefault === "function") {
        popup.preventDefault();
      }
      if (!popup.url) return;
      if (view.loadURL) {
        void view.loadURL(popup.url);
      } else {
        view.setAttribute("src", popup.url);
      }
    };
    view.addEventListener("dom-ready", handleDomReady);
    view.addEventListener("did-stop-loading", handleStop);
    view.addEventListener("did-finish-load", handleReady);
    view.addEventListener("did-fail-load", handleFail);
    view.addEventListener("did-start-loading", handleStart);
    view.addEventListener("new-window", handleNewWindow);
    return () => {
      view.removeEventListener("dom-ready", handleDomReady);
      view.removeEventListener("did-stop-loading", handleStop);
      view.removeEventListener("did-finish-load", handleReady);
      view.removeEventListener("did-fail-load", handleFail);
      view.removeEventListener("did-start-loading", handleStart);
      view.removeEventListener("new-window", handleNewWindow);
    };
  }, [isElectron, browserSrc]);

  const collectWebviewText = useCallback(async (): Promise<string> => {
    const view = webviewRef.current;
    if (!view) return "";
    const script = `(() => {
      const readText = (doc) => {
        if (!doc) return '';
        const body = doc.body;
        const inner = body ? body.innerText || '' : '';
        const content = body ? body.textContent || '' : '';
        const title = doc.title || '';
        return [title, inner, content].filter(Boolean).join('\\n');
      };
      const mainText = readText(document);
      const frames = Array.from(document.querySelectorAll('iframe'));
      const frameText = frames
        .map((frame) => {
          try {
            const doc = frame.contentDocument;
            return readText(doc);
          } catch {
            return '';
          }
        })
        .filter(Boolean)
        .join('\\n');
      return [mainText, frameText].filter(Boolean).join('\\n');
    })()`;
    try {
      const result = await view.executeJavaScript(script, true);
      setWebviewStatus("ready");
      return typeof result === "string" ? result : "";
    } catch (err) {
      console.error("Failed to read webview text", err);
      return "";
    }
  }, []);

  const collectWebviewFields = useCallback(async (): Promise<PageFieldCandidate[]> => {
    const view = webviewRef.current;
    if (!view) return [];
    const script = `(() => {
      const fields = [];
      const norm = (s) => (s || '').replace(/\\s+/g, ' ').trim();
      const textOf = (el) => norm(el && (el.textContent || el.innerText || ''));
      const getWin = (el) =>
        (el && el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window);
      const isVisible = (el) => {
        const win = getWin(el);
        const cs = win.getComputedStyle(el);
        if (!cs || cs.display === 'none' || cs.visibility === 'hidden') return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      const esc = (doc, v) => {
        const css = doc.defaultView && doc.defaultView.CSS;
        return css && css.escape ? css.escape(v) : v.replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
      };
      const getLabelText = (el, doc) => {
        try {
          const labels = el.labels;
          if (labels && labels.length) {
            const t = Array.from(labels).map((n) => textOf(n)).filter(Boolean);
            if (t.length) return t.join(' ');
          }
        } catch {
          /* ignore */
        }
        const id = el.getAttribute('id');
        if (id) {
          const lab = doc.querySelector('label[for="' + esc(doc, id) + '"]');
          const t = textOf(lab);
          if (t) return t;
        }
        const wrap = el.closest('label');
        const t2 = textOf(wrap);
        return t2 || '';
      };
      const getAriaName = (el, doc) => {
        const direct = norm(el.getAttribute('aria-label'));
        if (direct) return direct;
        const labelledBy = norm(el.getAttribute('aria-labelledby'));
        if (labelledBy) {
          const parts = labelledBy
            .split(/\\s+/)
            .map((id) => textOf(doc.getElementById(id)))
            .filter(Boolean);
          return norm(parts.join(' '));
        }
        return '';
      };
      let uid = 0;
      const collectFrom = (doc, prefix) => {
        const nodes = Array.from(
          doc.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
        );
        for (const el of nodes) {
          const tag = el.tagName.toLowerCase();
          const typeAttr = (el.getAttribute('type') || '').toLowerCase();
          const isRich = el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
          let type = 'text';
          if (tag === 'select') type = 'select';
          else if (tag === 'textarea') type = 'textarea';
          else if (tag === 'input') type = typeAttr || el.type || 'text';
          else if (isRich) type = 'richtext';
          else type = tag;
          if (['submit', 'button', 'reset', 'image', 'hidden', 'file'].includes(type)) continue;
          if (el.disabled) continue;
          if (!isVisible(el)) continue;
          let key = el.getAttribute('data-smartwork-field');
          if (!key) {
            key = 'sw-' + prefix + '-' + uid;
            uid += 1;
            el.setAttribute('data-smartwork-field', key);
          }
          fields.push({
            field_id: el.getAttribute('name') || null,
            id: el.id || null,
            name: el.getAttribute('name') || null,
            label: getLabelText(el, doc) || null,
            ariaName: getAriaName(el, doc) || null,
            placeholder: el.getAttribute('placeholder') || null,
            type: type || null,
            required: Boolean(el.required),
            selector: '[data-smartwork-field="' + key + '"]',
          });
          if (fields.length >= 300) break;
        }
      };
      collectFrom(document, 'main');
      const frames = Array.from(document.querySelectorAll('iframe'));
      frames.forEach((frame, idx) => {
        try {
          const doc = frame.contentDocument;
          if (doc) collectFrom(doc, 'frame' + idx);
        } catch {
          /* ignore */
        }
      });
      return fields;
    })()`;
    try {
      const result = await view.executeJavaScript(script, true);
      setWebviewStatus("ready");
      return Array.isArray(result) ? (result as PageFieldCandidate[]) : [];
    } catch (err) {
      console.error("Failed to read webview fields", err);
      return [];
    }
  }, []);

  const applyAutofillActions = useCallback(async (actions: FillPlanAction[]) => {
    const view = webviewRef.current;
    if (!view || !actions?.length) return null;
    const payload = JSON.stringify(actions);
    const script = `(() => {
      const actions = ${payload};
      const results = { filled: [], blocked: [] };
      const norm = (s) => (s || '').toLowerCase().replace(/\\s+/g, ' ').trim();
      const escAttr = (doc, v) => {
        const css = doc.defaultView && doc.defaultView.CSS;
        return css && css.escape ? css.escape(v) : v.replace(/["\\\\]/g, '\\\\$&');
      };
      const collectDocs = () => {
        const docs = [document];
        const frames = Array.from(document.querySelectorAll('iframe'));
        frames.forEach((frame) => {
          try {
            const doc = frame.contentDocument;
            if (doc) docs.push(doc);
          } catch {
            /* ignore */
          }
        });
        return docs;
      };
      const dispatch = (el) => {
        const win =
          (el.ownerDocument && el.ownerDocument.defaultView ? el.ownerDocument.defaultView : window);
        el.dispatchEvent(new win.Event('input', { bubbles: true }));
        el.dispatchEvent(new win.Event('change', { bubbles: true }));
      };
      const selectOption = (el, value) => {
        const val = String(value ?? '');
        const options = Array.from(el.options || []);
        const exact = options.find((o) => o.value === val || o.label === val);
        const soft = options.find((o) => o.label && o.label.toLowerCase() === val.toLowerCase());
        const match = exact || soft;
        if (match) {
          el.value = match.value;
          dispatch(el);
          return true;
        }
        el.value = val;
        dispatch(el);
        return false;
      };
      const setValue = (el, value) => {
        const val = String(value ?? '');
        if (typeof el.focus === 'function') el.focus();
        if (el.isContentEditable) {
          el.textContent = val;
        } else {
          el.value = val;
        }
        dispatch(el);
      };
      const findByLabel = (doc, label) => {
        if (!label) return null;
        const target = norm(label);
        if (!target) return null;
        const labels = Array.from(doc.querySelectorAll('label'));
        for (const lab of labels) {
          const text = norm(lab.textContent || '');
          if (!text) continue;
          if (text === target || text.includes(target)) {
            if (lab.control) return lab.control;
            const forId = lab.getAttribute('for');
            if (forId) return doc.getElementById(forId);
          }
        }
        return null;
      };
      const findByNameOrId = (doc, value) => {
        if (!value) return null;
        const esc = escAttr(doc, String(value));
        return (
          doc.querySelector('[name="' + esc + '"]') ||
          doc.getElementById(value) ||
          doc.querySelector('#' + esc)
        );
      };
      const findByHint = (doc, hint) => {
        if (!hint) return null;
        const target = norm(hint);
        if (!target) return null;
        const nodes = Array.from(
          doc.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="textbox"]'),
        );
        for (const el of nodes) {
          const placeholder = norm(el.getAttribute('placeholder'));
          const aria = norm(el.getAttribute('aria-label'));
          const name = norm(el.getAttribute('name'));
          const id = norm(el.getAttribute('id'));
          if ([placeholder, aria, name, id].some((v) => v && v.includes(target))) {
            return el;
          }
        }
        return null;
      };
      const findElement = (doc, step) => {
        let el = null;
        if (step.selector && typeof step.selector === 'string') {
          try {
            el = doc.querySelector(step.selector);
          } catch {
            el = null;
          }
        }
        if (!el) el = findByNameOrId(doc, step.field_id || step.field);
        if (!el) el = findByLabel(doc, step.label);
        if (!el) el = findByHint(doc, step.label || step.field_id || step.field);
        return el;
      };
      const docs = collectDocs();
      for (const step of actions) {
        const action = step.action || 'fill';
        if (action === 'skip') continue;
        let el = null;
        for (const doc of docs) {
          el = findElement(doc, step);
          if (el) break;
        }
        if (!el) {
          results.blocked.push(step.field || step.selector || step.label || 'field');
          continue;
        }
        if (action === 'upload') {
          results.blocked.push(step.field || step.selector || 'upload');
          continue;
        }
        if (action === 'click') {
          el.click();
          results.filled.push({ field: step.field || step.selector || 'field', value: 'click' });
          continue;
        }
        if (action === 'check' || action === 'uncheck') {
          if ('checked' in el) {
            el.checked = action === 'check';
            dispatch(el);
            results.filled.push({ field: step.field || step.selector || 'field', value: action });
          } else {
            results.blocked.push(step.field || step.selector || 'field');
          }
          continue;
        }
        if (action === 'select') {
          if (el.tagName.toLowerCase() === 'select') {
            selectOption(el, step.value);
          } else {
            setValue(el, step.value);
          }
          results.filled.push({ field: step.field || step.selector || 'field', value: String(step.value ?? '') });
          continue;
        }
        if (el.tagName.toLowerCase() === 'select') {
          selectOption(el, step.value);
          results.filled.push({ field: step.field || step.selector || 'field', value: String(step.value ?? '') });
          continue;
        }
        setValue(el, step.value);
        results.filled.push({ field: step.field || step.selector || 'field', value: String(step.value ?? '') });
      }
      return results;
    })()`;
    try {
      const result = await view.executeJavaScript(script, true);
      if (result && typeof result === "object") {
        return result as { filled?: { field: string; value: string }[]; blocked?: string[] };
      }
      return null;
    } catch (err) {
      console.error("Failed to apply autofill in webview", err);
      return null;
    }
  }, []);

  async function handleGo() {
    if (!user || !selectedProfileId || !url) return;
    setLoadingAction("go");
    setCheckEnabled(false);
    try {
      const newSession: ApplicationSession = await withTimeout(
        api("/sessions", {
          method: "POST",
          body: JSON.stringify({
            bidderUserId: user.id,
            profileId: selectedProfileId,
            url,
          }),
        }),
        CONNECT_TIMEOUT_MS,
        "Connecting timed out. Please try again."
      );
      setSession(newSession);
      setStatus("Connecting to remote browser...");
      await withTimeout(
        api(`/sessions/${newSession.id}/go`, { method: "POST" }),
        CONNECT_TIMEOUT_MS,
        "Connecting timed out. Please try again."
      );
      setStatus("Connected to remote browser");
      void refreshMetrics();
    } catch (err) {
      console.error(err);
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Failed to start session. Check backend logs.";
      showError(message);
      setStatus("Connection failed");
    } finally {
      setLoadingAction("");
    }
  }

  async function handleCheck() {
    if (!session) return;
    setLoadingAction("check");
    setCheckEnabled(false);
    let didSubmit = false;
    try {
      if (!isElectron) {
        showError("Check is only available in the desktop app.");
        return;
      }
      if (!webviewRef.current) {
        showError("Embedded browser is not ready yet. Try again in a moment.");
        return;
      }
      if (webviewStatus === "failed") {
        showError("Embedded browser failed to load. Try again or open in a browser tab.");
        return;
      }
      if (!applicationPhrases.length) {
        showError("No check phrases configured. Ask an admin to add them.");
        return;
      }
      const pageText = await withTimeout(
        collectWebviewText(),
        CHECK_TIMEOUT_MS,
        "Check timed out. Please try again."
      );
      const normalizedPage = normalizeTextForMatch(pageText);
      if (!normalizedPage) {
        showError("No text found on the page to check yet.");
        return;
      }
      const squishedPage = normalizedPage.replace(/\s+/g, "");
      const matchedPhrase = normalizedCheckPhrases.find(
        (phrase) =>
          normalizedPage.includes(phrase.normalized) ||
          (phrase.squished && squishedPage.includes(phrase.squished))
      );
      if (!matchedPhrase) {
        showError("No submission confirmation detected yet.");
        return;
      }
      await withTimeout(
        api(`/sessions/${session.id}/mark-submitted`, { method: "POST" }),
        CHECK_TIMEOUT_MS,
        "Check timed out. Please try again."
      );
      setSession({ ...session, status: "SUBMITTED" });
      didSubmit = true;
      if (user?.id) {
        await refreshMetrics(user.id);
      }
    } catch (err) {
      console.error(err);
      showError("Check failed. Backend must be running.");
    } finally {
      setLoadingAction("");
      if (!didSubmit && isElectron && webviewStatus === "ready") {
        setCheckEnabled(true);
      }
    }
  }

  async function handleAutofill() {
    if (!session) return;
    setLoadingAction("autofill");
    try {
      const isDesktop = isElectron;
      if (isDesktop && !webviewRef.current) {
        showError("Embedded browser is not ready yet. Try again in a moment.");
        setLoadingAction("");
        return;
      }
      if (isDesktop && webviewStatus === "failed") {
        showError("Embedded browser failed to load. Try again or open in a browser tab.");
        setLoadingAction("");
        return;
      }
      const pageFields = isDesktop ? await collectWebviewFields() : [];
      if (isDesktop && pageFields.length === 0) {
        showError("No form fields detected in the embedded browser. Try again after the form loads.");
        setLoadingAction("");
        return;
      }
      const res = (await api(`/sessions/${session.id}/autofill`, {
        method: "POST",
        body: JSON.stringify({
          useLlm: useLlmAutofill,
          pageFields: isDesktop ? pageFields : undefined,
        }),
      })) as AutofillResponse;
      const canApply = isElectron && Boolean(webviewRef.current) && Boolean(browserSrc);
      if (canApply && res.fillPlan?.actions?.length) {
        await applyAutofillActions(res.fillPlan.actions);
      }
      setSession({
        ...session,
        status: "FILLED",
      });
    } catch (err) {
      console.error(err);
      showError("Autofill failed. Backend must be running.");
    } finally {
      setLoadingAction("");
    }
  }

  const stopJdSelectionPolling = useCallback(() => {
    if (jdSelectionPollRef.current !== null) {
      window.clearInterval(jdSelectionPollRef.current);
      jdSelectionPollRef.current = null;
    }
  }, []);

  const startJdSelectionPolling = useCallback(() => {
    if (jdSelectionPollRef.current !== null) {
      window.clearInterval(jdSelectionPollRef.current);
    }
    jdSelectionPollRef.current = window.setInterval(async () => {
      if (!jdSelectionModeRef.current) return;
      const view = webviewRef.current;
      if (!view) return;
      try {
        const result = await view.executeJavaScript(
          "window.__smartworkSelectionText || ''",
          true
        );
        if (typeof result !== "string") return;
        const text = result.trim();
        if (!text) return;
        if (!jdPreviewOpenRef.current) {
          if (text !== jdDraftRef.current) {
            setJdDraft(text);
          }
          setJdPreviewOpen(true);
        }
      } catch {
        // ignore selection polling errors
      }
    }, 600);
  }, []);

  const installJdSelectionCapture = useCallback(async () => {
    const view = webviewRef.current;
    if (!view) return;
    const script = `(() => {
      try {
        if (window.__smartworkSelectionCapture) return true;
        window.__smartworkSelectionCapture = true;
        window.__smartworkSelectionText = window.__smartworkSelectionText || '';
        const capture = () => {
          try {
            const selection = window.getSelection ? window.getSelection().toString() : '';
            const text = selection ? selection.trim() : '';
            if (text) window.__smartworkSelectionText = text;
          } catch {
            /* ignore */
          }
        };
        document.addEventListener('mouseup', capture);
        document.addEventListener('keyup', capture);

        const attachFrame = (frame) => {
          try {
            const doc = frame.contentDocument;
            if (!doc) return;
            doc.addEventListener('mouseup', capture);
            doc.addEventListener('keyup', capture);
          } catch {
            /* ignore */
          }
        };
        Array.from(document.querySelectorAll('iframe')).forEach(attachFrame);
        const obs = new MutationObserver((mutations) => {
          for (const m of mutations) {
            for (const node of Array.from(m.addedNodes || [])) {
              if (node && node.tagName && node.tagName.toLowerCase() === 'iframe') {
                attachFrame(node);
              }
            }
          }
        });
        obs.observe(document.documentElement, { childList: true, subtree: true });
        window.__smartworkSelectionClear = () => {
          try {
            window.__smartworkSelectionText = '';
            const sel = window.getSelection && window.getSelection();
            if (sel && sel.removeAllRanges) sel.removeAllRanges();
          } catch {
            /* ignore */
          }
        };
        return true;
      } catch {
        return false;
      }
    })()`;
    await view.executeJavaScript(script, true);
  }, []);

  const clearJdSelection = useCallback(async () => {
    const view = webviewRef.current;
    if (!view) return;
    const script = `(() => {
      try {
        if (typeof window.__smartworkSelectionClear === 'function') {
          window.__smartworkSelectionClear();
        } else {
          window.__smartworkSelectionText = '';
          const sel = window.getSelection && window.getSelection();
          if (sel && sel.removeAllRanges) sel.removeAllRanges();
        }
      } catch {
        /* ignore */
      }
      return true;
    })()`;
    await view.executeJavaScript(script, true);
  }, []);

  async function handleGenerateResume() {
    if (!selectedProfile || !selectedProfileId) {
      showError("Select a profile before generating a resume.");
      return;
    }
    if (!isElectron) {
      showError("Generate resume is only available in the desktop app.");
      return;
    }
    if (!webviewRef.current) {
      showError("Embedded browser is not ready yet. Try again in a moment.");
      return;
    }
    if (webviewStatus === "failed") {
      showError("Embedded browser failed to load. Try again or open in a browser tab.");
      return;
    }
    setJdSelectionMode(true);
    jdSelectionModeRef.current = true;
    setJdPreviewOpen(false);
    setJdCaptureError("");
    setJdDraft("");
    setJdCaptureLoading(true);
    try {
      await clearJdSelection();
      await installJdSelectionCapture();
      startJdSelectionPolling();
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Selection mode failed.";
      setJdCaptureError(message);
    } finally {
      setJdCaptureLoading(false);
    }
  }

  function handleCancelJd() {
    stopJdSelectionPolling();
    setJdSelectionMode(false);
    jdSelectionModeRef.current = false;
    setJdPreviewOpen(false);
    setJdCaptureError("");
    setJdDraft("");
  }

  async function handleReselectJd() {
    setJdCaptureError("");
    setJdDraft("");
    setJdPreviewOpen(false);
    await clearJdSelection();
  }

  async function handleConfirmJd() {
    if (!jdDraft.trim()) {
      setJdCaptureError("Job description is empty.");
      return;
    }
    stopJdSelectionPolling();
    setJdSelectionMode(false);
    jdSelectionModeRef.current = false;
    setResumePreviewOpen(true);
    setJdPreviewOpen(false);
    if (!resumeTemplates.length && !resumeTemplatesLoading) {
      void loadResumeTemplates();
    }
    setTailorError("");
    setTailorPdfError("");
    setLlmRawOutput("");
    setLlmMeta(null);
    setTailorLoading(true);
    try {
      const baseResume = baseResumeView;
      const baseResumeText = JSON.stringify(baseResume, null, 2);
      const payload: Record<string, unknown> = {
        jobDescriptionText: jdDraft.trim(),
        baseResume,
        baseResumeText,
        provider: aiProvider,
      };
      const response = (await api("/llm/tailor-resume", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as TailorResumeResponse;
      setLlmRawOutput(response.content ?? "");
      setLlmMeta({ provider: response.provider, model: response.model });
      const parsed = extractTailorPayload(response);
      if (!parsed) {
        throw new Error("LLM did not return JSON output.");
      }
      const patchCandidate = selectResumePatch(parsed);
      const nextResume = isBulletAugmentation(patchCandidate)
        ? applyBulletAugmentation(baseResume, patchCandidate)
        : isCompanyBulletMap(patchCandidate)
        ? applyCompanyBulletMap(baseResume, patchCandidate)
        : mergeResumeData(baseResume, normalizeResumePatch(patchCandidate));
      const normalized = normalizeBaseResume(nextResume);
      setTailoredResume(normalized);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Resume generation failed.";
      setTailorError(message);
    } finally {
      setTailorLoading(false);
    }
  }

  async function handleRegenerateResume() {
    if (!jdDraft.trim()) {
      setTailorError("Job description is empty.");
      return;
    }
    if (!selectedProfile) {
      setTailorError("Select a profile before generating a resume.");
      return;
    }
    setTailorError("");
    setTailorPdfError("");
    setLlmRawOutput("");
    setLlmMeta(null);
    setTailorLoading(true);
    try {
      const baseResume = baseResumeView;
      const baseResumeText = JSON.stringify(baseResume, null, 2);
      const payload: Record<string, unknown> = {
        jobDescriptionText: jdDraft.trim(),
        baseResume,
        baseResumeText,
        provider: aiProvider,
      };
      const response = (await api("/llm/tailor-resume", {
        method: "POST",
        body: JSON.stringify(payload),
      })) as TailorResumeResponse;
      setLlmRawOutput(response.content ?? "");
      setLlmMeta({ provider: response.provider, model: response.model });
      const parsed = extractTailorPayload(response);
      if (!parsed) {
        throw new Error("LLM did not return JSON output.");
      }
      const patchCandidate = selectResumePatch(parsed);
      const nextResume = isBulletAugmentation(patchCandidate)
        ? applyBulletAugmentation(baseResume, patchCandidate)
        : isCompanyBulletMap(patchCandidate)
        ? applyCompanyBulletMap(baseResume, patchCandidate)
        : mergeResumeData(baseResume, normalizeResumePatch(patchCandidate));
      const normalized = normalizeBaseResume(nextResume);
      setTailoredResume(normalized);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Resume generation failed.";
      setTailorError(message);
    } finally {
      setTailorLoading(false);
    }
  }

  async function handleDownloadTailoredPdf() {
    if (!resumePreviewHtml.trim()) {
      setTailorPdfError("Select a template to export.");
      return;
    }
    setTailorPdfLoading(true);
    setTailorPdfError("");
    try {
      const base = API_BASE || (typeof window !== "undefined" ? window.location.origin : "");
      const url = new URL("/resume-templates/render-pdf", base).toString();
      const fileName = buildResumePdfName(selectedProfile?.displayName, selectedTemplate?.name);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${window.localStorage.getItem("smartwork_token") ?? ""}`,
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
      setTailorPdfError(message);
    } finally {
      setTailorPdfLoading(false);
    }
  }

  useEffect(() => {
    const fetchForUser = async () => {
      if (!user || user.role === "OBSERVER") return;
      try {
        const profs: Profile[] = await api(`/profiles`);
        const visible =
          user.role === "BIDDER"
            ? profs.filter((p) => p.assignedBidderId === user.id)
            : profs;
        const normalized = visible.map((p) => ({
          ...p,
          baseInfo: cleanBaseInfo(p.baseInfo ?? {}),
        }));
        setProfiles(normalized);
        const defaultProfileId = normalized[0]?.id ?? "";
        setSelectedProfileId(defaultProfileId);
        void refreshMetrics(user.id);
      } catch (err) {
        console.error(err);
      }
    };
    void fetchForUser();
  }, [user, refreshMetrics]);

  if (!user) {
    return (
      <main className="min-h-screen w-full bg-white text-slate-900">
        <TopNav />
        <div className="mx-auto max-w-screen-md px-4 py-10 text-center text-sm text-slate-800">
          Redirecting to login...
        </div>
      </main>
    );
  }

  if (user.role === "OBSERVER") {
    return (
      <main className="min-h-screen w-full bg-white text-slate-900">
        <TopNav />
        <div className="mx-auto max-w-screen-md px-4 py-12 text-center space-y-3">
          <p className="text-[11px] uppercase tracking-[0.28em] text-slate-700">Observer</p>
          <h1 className="text-2xl font-semibold">Welcome aboard</h1>
          <p className="text-sm text-slate-700">
            Observers can browse announcements. Workspace actions are disabled.
          </p>
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-slate-800">
            <p className="text-sm font-semibold">Stay tuned</p>
            <p className="text-sm text-slate-700">
              Ask an admin to upgrade your role to start bidding.
            </p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <>
    <main className="min-h-screen w-full bg-white text-slate-900">
      <TopNav />
      {jdSelectionMode ? (
        <div
          className="fixed inset-0 z-40 cursor-pointer bg-slate-900/65 backdrop-blur-[1px]"
          onClick={handleCancelJd}
          aria-hidden="true"
        />
      ) : null}
      <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 space-y-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.24em] text-slate-700">
              Application Assist
            </p>
            <h1 className="text-2xl font-semibold">SmartWork Bidder Workspace</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-white px-3 py-1.5 text-xs text-slate-800">
              {status}
            </div>
            <div className="rounded-full bg-[#5ef3c5] px-3 py-1.5 text-xs font-semibold text-[#0b1224]">
              Ctrl + Shift + F
            </div>
          </div>
        </div>

        {user ? null : null}

        {user ? (
        <div className="grid gap-4 xl:grid-cols-[1.1fr_3.6fr_1.5fr]">
          {/* Left column 15% */}
          <section className="space-y-4 rounded-3xl border border-slate-200 bg-white p-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-slate-700">
                    Profile
                  </p>
                  <p className="text-lg font-semibold">
                    {selectedProfile?.displayName ?? "Select profile"}
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-800">
                  {user?.email ?? "Offline"}
                </span>
              </div>
              {isBidder ? (
                <div className="w-full rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-900">
                  {selectedProfile?.displayName ?? "Assigned profile"}
                </div>
              ) : (
                <select
                  value={selectedProfileId}
                  onChange={(e) => setSelectedProfileId(e.target.value)}
                  className="w-full rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-white/10"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.displayName}
                    </option>
                  ))}
                </select>
              )}
              <p className="text-xs text-slate-700">Role: {user?.role ?? "Unknown"}</p>
            </div>

            <div className="space-y-3">
              <StatTile
                label="Tried"
                value={metrics ? `${metrics.tried}` : "0"}
                helper="Sessions started"
              />
              <StatTile
                label="Applied"
                value={metrics ? `${metrics.submitted}` : "0"}
                helper="Marked submitted"
              />
              <StatTile
                label="Applied %"
                value={appliedPct}
                helper="Submitted / Tried"
              />
              <StatTile
                label="Monthly applied"
                value={`${monthlyApplied}`}
                helper="This month"
              />
            </div>
          </section>

          {/* Main column 60% */}
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="text-base font-semibold">Navigate to job URL</div>
                <div className="text-xs text-slate-700">Remote browser stream</div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://"
                  className="w-full rounded-xl bg-slate-100 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-white/10"
                />
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  <button
                    onClick={handleGo}
                    disabled={loadingAction === "go" || !selectedProfileId}
                    className="min-w-[110px] rounded-xl bg-[#4ade80] px-4 py-2 text-sm font-semibold text-[#0b1224] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingAction === "go" ? "Connecting..." : "Go"}
                  </button>
                  <button
                    onClick={handleCheck}
                    disabled={!canCheck}
                    className="min-w-[110px] rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-800 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loadingAction === "check" ? "Checking..." : "Check"}
                  </button>
                </div>
              </div>
            </div>

            <div
              className={`relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 ${
                jdSelectionMode ? "z-50 ring-2 ring-emerald-400 shadow-2xl" : ""
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.25em] text-slate-700">
                    Remote Browser
                  </p>
                  <p className="text-lg font-semibold">
                    {session ? safeHostname(session.url) : "No URL loaded"}
                  </p>
                </div>
                <div className="text-xs text-[#5ef3c5]">
                  Status: {session ? session.status : "Idle"}
                </div>
              </div>
              {jdSelectionMode ? (
                <div className="absolute right-4 top-4 z-10 rounded-full bg-emerald-500/90 px-3 py-1 text-[11px] font-semibold text-emerald-950">
                  Selection mode
                </div>
              ) : null}
              <div className="relative min-h-[420px] h-[70vh] max-h-[80vh] overflow-hidden rounded-xl border border-slate-200 bg-slate-950">
                {streamFrame ? (
                  <div className="h-full w-full overflow-auto bg-slate-950">
                    <img
                      src={streamFrame}
                      alt="Remote browser stream"
                      className="block w-full"
                    />
                  </div>
                ) : browserSrc ? (
                  isElectron ? (
                    <div className="relative h-full w-full">
                      <webview
                        ref={webviewRef as unknown as React.Ref<HTMLWebViewElement>}
                        key={browserSrc}
                        src={browserSrc}
                        partition={webviewPartition}
                        allowpopups="true"
                        style={{ height: "100%", width: "100%", backgroundColor: "#020617" }}
                      />
                      <div className="absolute top-2 right-3 flex items-center gap-2 text-[11px] text-slate-800">
                        <span className="rounded-full bg-slate-100lack/50 px-2 py-1">Electron view</span>
                        {webviewStatus === "ready" && (
                          <span className="rounded-full bg-[#5ef3c5]/80 px-2 py-1 text-[#0b1224]">
                            Loaded
                          </span>
                        )}
                        {webviewStatus === "loading" && (
                          <span className="rounded-full bg-slate-100lack/50 px-2 py-1 text-slate-800">
                            Loading…
                          </span>
                        )}
                      </div>
                      {webviewStatus === "failed" && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 p-4 text-center text-sm text-slate-800">
                          <div className="space-y-2">
                            <div>Could not load this page inside the Electron view.</div>
                            <a
                              href={browserSrc}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-full bg-[#5ef3c5] px-4 py-2 text-xs font-semibold text-[#0b1224] hover:brightness-110"
                            >
                              Open in browser
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <iframe
                        key={browserSrc}
                        src={browserSrc}
                        className="h-full w-full"
                        allowFullScreen
                        referrerPolicy="no-referrer"
                        onLoad={() => setFrameLoaded(true)}
                      />
                      {!frameLoaded && (
                        <div className="absolute inset-0 flex items-center justify-center bg-slate-950/80 text-slate-800">
                          <div className="text-center space-y-2">
                            <div className="text-sm font-semibold">
                              Site may block iframe embedding.
                            </div>
                            <a
                              href={browserSrc}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-full bg-[#5ef3c5] px-4 py-2 text-xs font-semibold text-[#0b1224] hover:brightness-110"
                            >
                              Open in new tab
                            </a>
                          </div>
                        </div>
                      )}
                      <div className="absolute top-2 right-2 flex gap-2">
                        <a
                          href={browserSrc}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-full bg-slate-100lack/50 px-3 py-1 text-[11px] text-slate-800 hover:bg-slate-100lack/60"
                        >
                          Open in new tab
                        </a>
                      </div>
                    </>
                  )
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-800">
                    <div className="text-center">
                      <div className="text-sm font-semibold">No URL loaded</div>
                      <div className="text-xs text-slate-700">
                        Enter a URL and click Go.
                      </div>
                    </div>
                  </div>
                )}
                {streamConnected && (
                  <div className="pointer-events-none absolute bottom-2 right-3 rounded-full bg-slate-100lack/40 px-3 py-1 text-[11px] text-[#5ef3c5]">
                    Streaming
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Right column 25% */}
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Autofill</p>
                <span className="text-xs text-slate-700">Hotkey: Ctrl+Shift+F</span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-800">
                <span>Use LLM fallback</span>
                <button
                  onClick={() => setUseLlmAutofill((v) => !v)}
                  className={`relative flex h-6 w-12 items-center rounded-full transition ${
                    useLlmAutofill ? "bg-[#4ade80]" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                      useLlmAutofill ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                  <span className="sr-only">Toggle LLM autofill</span>
                </button>
              </div>
              <button
                onClick={handleAutofill}
                disabled={!session || loadingAction === "autofill"}
                className="w-full rounded-xl bg-[#4ade80] px-4 py-2 text-sm font-semibold text-[#0b1224] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingAction === "autofill" ? "Filling..." : "Autofill"}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Tailored resume</p>
              </div>
              <label className="space-y-1">
                <span className="text-[10px] uppercase tracking-[0.24em] text-slate-500">
                  Provider
                </span>
                <select
                  value={aiProvider}
                  onChange={(event) =>
                    setAiProvider(event.target.value as "OPENAI" | "HUGGINGFACE" | "GEMINI")
                  }
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                >
                  <option value="HUGGINGFACE">Hugging Face</option>
                  <option value="OPENAI">OpenAI</option>
                  <option value="GEMINI">Gemini</option>
                </select>
              </label>
              <button
                onClick={handleGenerateResume}
                disabled={!selectedProfileId || tailorLoading || jdCaptureLoading || jdSelectionMode}
                className="w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {jdCaptureLoading ? "Reading JD..." : tailorLoading ? "Generating..." : "Generate Resume"}
              </button>
              <p className="text-xs text-slate-600">
                Review the job description before sending to AI.
              </p>
              {jdSelectionMode ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  Selection mode active. Highlight the job description in the browser.
                </div>
              ) : null}
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold">Profile base info</p>
                <button
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-800 shadow-sm transition hover:bg-slate-100"
                  title={showBaseInfo ? "Hide base info" : "Show base info"}
                  onClick={() => setShowBaseInfo((v) => !v)}
                >
                  <TriangleIcon direction={showBaseInfo ? "down" : "left"} />
                  <span className="sr-only">{showBaseInfo ? "Hide base info" : "Show base info"}</span>
                </button>
              </div>
              {showBaseInfo ? (
                <div className="space-y-2 text-sm text-slate-800">
                  <EditableRow label="First name" editing={false} value={baseDraft?.name?.first || "N/A"} />
                  <EditableRow label="Last name" editing={false} value={baseDraft?.name?.last || "N/A"} />
                  <EditableRow label="Email" editing={false} value={baseDraft?.contact?.email || "N/A"} />
                  <EditableRow label="Phone code" editing={false} value={baseDraft?.contact?.phoneCode || "N/A"} />
                  <EditableRow label="Phone number" editing={false} value={baseDraft?.contact?.phoneNumber || "N/A"} />
                  <EditableRow label="Phone (combined)" editing={false} value={formatPhone(baseDraft.contact) || "N/A"} />
                  <EditableRow label="LinkedIn" editing={false} value={baseDraft?.links?.linkedin || "N/A"} />
                  <EditableRow label="Address" editing={false} value={baseDraft?.location?.address || "N/A"} />
                  <EditableRow label="City" editing={false} value={baseDraft?.location?.city || "N/A"} />
                  <EditableRow label="State / Province" editing={false} value={baseDraft?.location?.state || "N/A"} />
                  <EditableRow label="Country" editing={false} value={baseDraft?.location?.country || "N/A"} />
                  <EditableRow label="Postal code" editing={false} value={baseDraft?.location?.postalCode || "N/A"} />
                  <EditableRow label="Job title" editing={false} value={baseDraft?.career?.jobTitle || "N/A"} />
                  <EditableRow label="Current company" editing={false} value={baseDraft?.career?.currentCompany || "N/A"} />
                  <EditableRow label="Years of experience" editing={false} value={(baseDraft?.career?.yearsExp as string) || "N/A"} />
                  <EditableRow label="Desired salary" editing={false} value={baseDraft?.career?.desiredSalary || "N/A"} />
                  <EditableRow label="School" editing={false} value={baseDraft?.education?.school || "N/A"} />
                  <EditableRow label="Degree" editing={false} value={baseDraft?.education?.degree || "N/A"} />
                  <EditableRow label="Major / field" editing={false} value={baseDraft?.education?.majorField || "N/A"} />
                  <EditableRow label="Graduation date" editing={false} value={baseDraft?.education?.graduationAt || "N/A"} />
                  <EditableRow label="Authorized to work" editing={false} value={baseDraft?.workAuth?.authorized ? "Yes" : "No"} />
                </div>
              ) : null}
            </div>
          </section>
        </div>
        ) : (
          <div />
        )}

      </div>
      {jdPreviewOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-6"
          onClick={() => setJdPreviewOpen(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">
                  Job description
                </p>
                <h2 className="text-2xl font-semibold text-slate-900">Review</h2>
                <p className="text-xs text-slate-500">
                  Confirm the JD text before sending to AI.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancelJd}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <textarea
                value={jdDraft}
                onChange={(event) => setJdDraft(event.target.value)}
                placeholder={jdCaptureLoading ? "Enable selection mode..." : "Selected job description"}
                className="h-80 w-full rounded-2xl border border-slate-200 bg-white p-3 text-sm text-slate-900 outline-none ring-1 ring-transparent focus:ring-slate-300"
                disabled={jdCaptureLoading}
              />
              {jdCaptureError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {jdCaptureError}
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleConfirmJd}
                  disabled={jdCaptureLoading || !jdDraft.trim() || tailorLoading}
                  className="rounded-full bg-slate-900 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {tailorLoading ? "Generating..." : "Generate"}
                </button>
                <button
                  type="button"
                  onClick={handleReselectJd}
                  disabled={jdCaptureLoading || tailorLoading}
                  className="rounded-full border border-slate-200 px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Reselect
                </button>
                <button
                  type="button"
                  onClick={handleCancelJd}
                  disabled={jdCaptureLoading || tailorLoading}
                  className="rounded-full border border-slate-200 px-4 py-1.5 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
              </div>
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
                  Tailored resume
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
                  onClick={handleDownloadTailoredPdf}
                  disabled={tailorPdfLoading || !resumePreviewHtml.trim()}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                >
                  {tailorPdfLoading ? "Saving..." : "Save PDF"}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerateResume}
                  disabled={tailorLoading || !jdDraft.trim()}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  {tailorLoading ? "Generating..." : "Regenerate"}
                </button>
                <button
                  type="button"
                  onClick={handleGenerateResume}
                  disabled={tailorLoading}
                  className="rounded-full border border-slate-200 px-3 py-1 text-xs text-slate-700 hover:bg-slate-100 disabled:opacity-60"
                >
                  Reselect JD
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
            {tailorError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {tailorError}
              </div>
            ) : null}
            {tailorPdfError ? (
              <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                {tailorPdfError}
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
                {tailorLoading ? (
                  <div className="flex h-[520px] items-center justify-center text-sm text-slate-500">
                    Generating tailored resume...
                  </div>
                ) : (
                  <iframe
                    title="Tailored resume preview"
                    srcDoc={resumePreviewDoc}
                    className="h-[520px] w-full"
                    sandbox=""
                    referrerPolicy="no-referrer"
                  />
                )}
              </div>
              {llmRawOutput ? (
                <details className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                  <summary className="cursor-pointer text-xs font-semibold text-slate-700">
                    LLM output (for testing)
                  </summary>
                  <div className="mt-2 text-[11px] text-slate-500">
                    Provider: {llmMeta?.provider || "unknown"} · Model: {llmMeta?.model || "unknown"}
                  </div>
                  <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-xs text-slate-800">
{llmRawOutput}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  );
}

function cleanString(val?: string | number | null) {
  if (typeof val === "number") return String(val);
  if (typeof val === "string") return val.trim();
  return "";
}

function formatPhone(contact?: BaseInfo["contact"]) {
  if (!contact) return "";
  const parts = [contact.phoneCode, contact.phoneNumber].map((p) => cleanString(p)).filter(Boolean);
  const combined = parts.join(" ").trim();
  const fallback = cleanString(contact.phone);
  return combined || fallback;
}

function cleanBaseInfo(base: BaseInfo): BaseInfo {
  const links = { ...(base?.links ?? {}) } as Record<string, string> & { linkedin?: string };
  if (typeof links.linkedin === "string") links.linkedin = links.linkedin.trim();
  return {
    name: { first: cleanString(base?.name?.first), last: cleanString(base?.name?.last) },
    contact: {
      email: cleanString(base?.contact?.email),
      phone: formatPhone(base?.contact),
      phoneCode: cleanString(base?.contact?.phoneCode),
      phoneNumber: cleanString(base?.contact?.phoneNumber),
    },
    links,
    location: {
      address: cleanString(base?.location?.address),
      city: cleanString(base?.location?.city),
      state: cleanString(base?.location?.state),
      country: cleanString(base?.location?.country),
      postalCode: cleanString(base?.location?.postalCode),
    },
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
    workAuth: {
      authorized: base?.workAuth?.authorized ?? false,
      needsSponsorship: base?.workAuth?.needsSponsorship ?? false,
    },
    preferences: base?.preferences ?? {},
    defaultAnswers: base?.defaultAnswers ?? {},
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  return Object.prototype.toString.call(value) === "[object Object]";
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
  const profileAlias = isPlainObject((value as Record<string, unknown>).profile)
    ? ((value as Record<string, unknown>).profile as Record<string, unknown>)
    : {};
  const profileInput = isPlainObject(value.Profile) ? value.Profile : profileAlias;
  const contactInput = isPlainObject(profileInput.contact) ? profileInput.contact : {};
  const summaryInput = isPlainObject(value.summary) ? value.summary : {};
  const summaryText =
    typeof value.summary === "string"
      ? value.summary
      : cleanString(summaryInput.text as string | number | null);
  const workExperience =
    Array.isArray(value.workExperience) && value.workExperience.length
      ? value.workExperience.map(normalizeWorkExperience)
      : [getEmptyWorkExperience()];
  const education =
    Array.isArray(value.education) && value.education.length
      ? value.education.map(normalizeEducation)
      : [getEmptyEducation()];
  const skillsInput = isPlainObject(value.skills) ? value.skills : {};
  const rawSkills = Array.isArray(value.skills) ? value.skills : skillsInput.raw;

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
    summary: { text: cleanString(summaryText) },
    workExperience,
    education,
    skills: { raw: normalizeStringList(rawSkills) },
  };
}

function parseJsonSafe(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonPayload(input: string) {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const direct = parseJsonSafe(trimmed);
  if (direct) return direct;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    const parsed = parseJsonSafe(fenced[1].trim());
    if (parsed) return parsed;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const parsed = parseJsonSafe(trimmed.slice(start, end + 1));
    if (parsed) return parsed;
  }
  return null;
}

function extractTailorPayload(response: TailorResumeResponse) {
  const parsed = response.parsed ?? extractJsonPayload(response.content ?? "");
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  return parsed as Record<string, unknown>;
}

function selectResumePatch(payload: Record<string, unknown>) {
  const candidates = [
    payload.tailored_resume,
    payload.tailoredResume,
    payload.resume,
    payload.updated_resume,
    payload.updates,
    payload.patch,
    payload.result,
    payload.output,
    payload.data,
  ];
  for (const candidate of candidates) {
    if (isPlainObject(candidate)) return candidate as Record<string, unknown>;
  }
  return payload;
}

function normalizeResumePatch(patch: Record<string, unknown>) {
  const next: Record<string, unknown> = { ...patch };
  if (!next.Profile && isPlainObject(next.profile)) {
    next.Profile = next.profile as Record<string, unknown>;
  }
  if (!next.workExperience && Array.isArray(next.work_experience)) {
    next.workExperience = next.work_experience;
  }
  if (!next.workExperience && Array.isArray(next.experience)) {
    next.workExperience = next.experience;
  }
  if (typeof next.summary === "string") {
    next.summary = { text: next.summary };
  }
  if (Array.isArray(next.skills)) {
    next.skills = { raw: next.skills };
  }
  if (typeof next.skills === "string") {
    next.skills = { raw: [next.skills] };
  }
  return next;
}

function isBulletAugmentation(value: Record<string, unknown>): value is BulletAugmentation {
  return (
    "first_company" in value ||
    "second_company" in value ||
    "other_companies" in value
  );
}

function isCompanyBulletMap(value: Record<string, unknown>): value is CompanyBulletMap {
  if (isBulletAugmentation(value)) return false;
  const entries = Object.entries(value);
  if (!entries.length) return false;
  const hasArray = entries.some(([, v]) => Array.isArray(v));
  if (!hasArray) return false;
  return entries.every(
    ([, v]) =>
      Array.isArray(v) && v.every((item) => typeof item === "string")
  );
}

function normalizeBulletList(value?: string[]) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => cleanString(item)).filter(Boolean);
}

function applyBulletAugmentation(base: BaseResume, augmentation: BulletAugmentation): BaseResume {
  const normalized = normalizeBaseResume(base);
  const workExperience = (normalized.workExperience ?? []).map((item) => ({
    ...item,
    bullets: Array.isArray(item.bullets) ? [...item.bullets] : [],
  }));

  const appendAt = (index: number, bullets?: string[]) => {
    if (index < 0 || index >= workExperience.length) return;
    const existing = normalizeBulletList(workExperience[index].bullets);
    const extras = normalizeBulletList(bullets);
    if (!extras.length) return;
    workExperience[index] = {
      ...workExperience[index],
      bullets: [...extras, ...existing],
    };
  };

  appendAt(0, augmentation.first_company);
  appendAt(1, augmentation.second_company);

  if (Array.isArray(augmentation.other_companies)) {
    augmentation.other_companies.forEach((entry) => {
      const rawIndex = entry?.experience_index;
      const index = typeof rawIndex === "number" ? rawIndex : Number(rawIndex);
      if (!Number.isFinite(index)) return;
      appendAt(index, entry?.bullets);
    });
  }

  return {
    ...normalized,
    workExperience,
  };
}

function buildExperienceKey(item: WorkExperience) {
  const title = cleanString(item.roleTitle);
  const company = cleanString(item.companyTitle);
  if (title && company) return `${title} - ${company}`;
  return title || company || "";
}

function normalizeCompanyKey(value: string) {
  return cleanString(value)
    .replace(/[–—−]/g, "-")
    .replace(/\s*-\s*/g, " - ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function buildExperienceKeyAliases(item: WorkExperience) {
  const aliases = new Set<string>();
  const key = buildExperienceKey(item);
  if (key) aliases.add(key);
  const title = cleanString(item.roleTitle);
  const company = cleanString(item.companyTitle);
  if (title) aliases.add(title);
  if (company) aliases.add(company);
  if (title && company) aliases.add(`${company} - ${title}`);
  return Array.from(aliases);
}

function applyCompanyBulletMap(base: BaseResume, map: CompanyBulletMap): BaseResume {
  const normalized = normalizeBaseResume(base);
  const workExperience = (normalized.workExperience ?? []).map((item) => ({
    ...item,
    bullets: Array.isArray(item.bullets) ? [...item.bullets] : [],
  }));
  const keyToIndex = new Map<string, number>();
  workExperience.forEach((item, index) => {
    buildExperienceKeyAliases(item).forEach((key) => {
      if (key && !keyToIndex.has(key)) {
        keyToIndex.set(key, index);
      }
      const normalizedKey = normalizeCompanyKey(key);
      if (normalizedKey && !keyToIndex.has(normalizedKey)) {
        keyToIndex.set(normalizedKey, index);
      }
    });
  });
  Object.entries(map).forEach(([key, bullets]) => {
    const cleanKey = cleanString(key);
    if (!cleanKey) return;
    const normalizedKey = normalizeCompanyKey(cleanKey);
    const index = keyToIndex.get(cleanKey) ?? keyToIndex.get(normalizedKey);
    if (index === undefined) return;
    const existing = normalizeBulletList(workExperience[index].bullets);
    const extras = normalizeBulletList(bullets);
    if (!extras.length) return;
    workExperience[index] = {
      ...workExperience[index],
      bullets: [...extras, ...existing],
    };
  });
  return { ...normalized, workExperience };
}

function mergeResumeData(base: BaseResume, patch: Record<string, unknown>) {
  if (!isPlainObject(patch)) return base;
  const target = isPlainObject(base) ? base : {};
  return deepMerge(target, patch) as BaseResume;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>) {
  const result: Record<string, unknown> = { ...target };
  Object.entries(source).forEach(([key, value]) => {
    if (Array.isArray(value)) {
      result[key] = value;
      return;
    }
    if (isPlainObject(value) && isPlainObject(result[key])) {
      result[key] = deepMerge(result[key] as Record<string, unknown>, value);
      return;
    }
    result[key] = value;
  });
  return result;
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
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

function StatTile({
  label,
  value,
  helper,
}: {
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-700 leading-snug">
        {label}
      </div>
      <div className="text-lg font-semibold leading-tight">{value}</div>
      {helper && <div className="text-[11px] text-slate-500">{helper}</div>}
    </div>
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

function EditableRow({
  label,
  value,
  editing,
  children,
}: {
  label: string;
  value: string;
  editing: boolean;
  children?: ReactNode;
  }) {
  return (
    <div className="rounded-lg bg-white/5 px-3 py-2">
      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.18em] text-slate-700">
        <span>{label}</span>
      </div>
      <div className="mt-2 text-sm text-slate-900">
        {editing ? (children ?? value ?? "N/A") : value ?? "N/A"}
      </div>
    </div>
  );
}

function safeHostname(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "N/A";
  }
}

function normalizeTextForMatch(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string) {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(timeoutMessage)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timeoutId) clearTimeout(timeoutId);
  });
}
