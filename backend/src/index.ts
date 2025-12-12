import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import fsSync from 'fs';
import { z } from 'zod';
import { chromium, Browser, Page } from 'playwright';
import bcrypt from 'bcryptjs';
import pdfParse from 'pdf-parse';
import { extractRawText } from 'mammoth';
import { events, llmSettings, sessions } from './data';
import { ApplicationSession, BaseInfo, Resume, SessionStatus, User, UserRole } from './types';
import { authGuard, forbidObserver, signToken } from './auth';
import {
  closeAssignmentById,
  deleteResumeById,
  findActiveAssignmentByProfile,
  findProfileById,
  findResumeById,
  findUserByEmail,
  findUserById,
  initDb,
  insertProfile,
  insertAssignmentRecord,
  insertResumeRecord,
  updateResumeParsed,
  insertUser,
  listAssignments,
  listBidderSummaries,
  listProfiles,
  listProfilesForBidder,
  listResumesByProfile,
  pool,
  updateProfileRecord,
} from './db';
import { analyzeJobFromUrl, callPromptPack, promptBuilders } from './resumeClassifier';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = fastify({ logger: true });
const PROJECT_ROOT = path.join(__dirname, '..');
const RESUME_DIR = process.env.RESUME_DIR ?? path.join(PROJECT_ROOT, 'data', 'resumes');

const livePages = new Map<
  string,
  { browser: Browser; page: Page; interval?: NodeJS.Timeout }
>();

function sanitizeText(input: string | undefined | null) {
  if (!input) return '';
  return input.replace(/\u0000/g, '');
}

function looksBinary(buf: Buffer) {
  if (!buf || !buf.length) return false;
  const sample = buf.subarray(0, Math.min(buf.length, 1024));
  let nonText = 0;
  for (const byte of sample) {
    if (byte === 0) return true;
    // allow tab/newline/carriage return and basic printable range
    if (byte < 9 || (byte > 13 && byte < 32) || byte > 126) {
      nonText += 1;
    }
  }
  return nonText / sample.length > 0.3;
}

async function extractResumeTextFromFile(filePath: string, fileName?: string) {
  try {
    const ext = (fileName ?? path.extname(filePath)).toLowerCase();
    const buf = await fs.readFile(filePath);

    // Try magic-header detection for PDF when extension is missing/misleading.
    if (buf.subarray(0, 4).toString() === '%PDF') {
      try {
        const parsed = await pdfParse(buf);
        if (parsed.text?.trim()) return sanitizeText(parsed.text);
      } catch {
        // fall through
      }
    }

    if (ext === '.txt') {
      return sanitizeText(buf.toString('utf8'));
    }
    if (ext === '.docx') {
      const res = await extractRawText({ path: filePath });
      return sanitizeText(res.value ?? '');
    }
    if (ext === '.pdf') {
      const parsed = await pdfParse(buf);
      return sanitizeText(parsed.text ?? '');
    }
    if (looksBinary(buf)) {
      return '';
    }
    return sanitizeText(buf.toString('utf8'));
  } catch (err) {
    console.error('extractResumeTextFromFile failed', err);
    return '';
  }
}

async function saveParsedResumeJson(resumeId: string, parsed: unknown) {
  await updateResumeParsed(resumeId, { resumeJson: parsed as Record<string, unknown> });
}

async function tryParseResumeText(resumeId: string, resumeText: string, baseProfile?: BaseInfo) {
  if (!resumeText?.trim()) return undefined;
  try {
    const prompt = promptBuilders.buildResumeParsePrompt({
      resumeId,
      resumeText,
      baseProfile,
    });
    const parsed = await callPromptPack(prompt);
    if (parsed?.result) return parsed.result;
    if (parsed) return parsed;
  } catch (err) {
    console.error('LLM resume parse failed', err);
  }
  return simpleParseResume(resumeText);
}

function simpleParseResume(resumeText: string) {
  const lines = resumeText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const emailMatch = resumeText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  const phoneMatch = resumeText.match(/(\+?\d[\d\s\-\(\)]{8,})/);
  const nameLine = lines.find((l) => l && l.length <= 80 && !l.includes('@') && !/\d/.test(l));
  const summary = lines.slice(0, 6).join(' ').slice(0, 600);

  const skillsIdx = lines.findIndex((l) => /skill/i.test(l));
  const skillsLine = skillsIdx >= 0 ? lines.slice(skillsIdx + 1, skillsIdx + 4).join(', ') : '';
  const skills = skillsLine
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 20);
  const linkedinMatch = resumeText.match(/https?:\/\/(?:www\.)?linkedin\.com\/[^\s)]+/i);

  // Section detection
  const workIdx = lines.findIndex((l) => /work\s+experience/i.test(l));
  const eduIdx = lines.findIndex((l) => /education/i.test(l));
  const endIdx = (idx: number) => {
    const cutoffs = [workIdx, eduIdx].filter((n) => n >= 0 && n > idx);
    return cutoffs.length ? Math.min(...cutoffs) : lines.length;
  };

  function sliceSection(idx: number) {
    if (idx < 0) return [];
    return lines.slice(idx + 1, endIdx(idx));
  }

  const workLines = sliceSection(workIdx);
  const educationLines = sliceSection(eduIdx);

  function parseWork(blocks: string[]) {
    const items: any[] = [];
    let current: any | null = null;
    const datePattern = /(\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)\.?\s*\d{4})/i;
    const rangePattern = /(\d{4})\s*[–-]\s*(Present|\d{4})/i;
    const bulletPattern = /^[\u2022*\-•]+\s*/;
    for (const l of blocks) {
      const isBullet = bulletPattern.test(l);
      if (!isBullet) {
        // treat as new role/company line when it looks like a heading
        const looksLikeRole =
          /engineer|developer|manager|lead|architect|consultant|specialist|director/i.test(l) ||
          rangePattern.test(l) ||
          datePattern.test(l);
        if (current) items.push(current);
        if (looksLikeRole) {
          const dates = l.match(rangePattern) || l.match(datePattern);
          const parts = l.split(/[–-]/);
          const titlePart = parts[0]?.trim() ?? '';
          const companyPart = parts.slice(1).join('-').replace(rangePattern, '').replace(datePattern, '').trim();
          current = {
            company: companyPart || l.replace(rangePattern, '').replace(datePattern, '').trim(),
            title: titlePart || '',
            start_date: dates ? dates[1] ?? '' : '',
            end_date: dates && dates[2] ? dates[2] : '',
            location: '',
            bullets: [] as string[],
          };
        } else if (current) {
          current.company = `${current.company} ${l}`.trim();
        } else {
          current = { company: l, title: '', start_date: '', end_date: '', location: '', bullets: [] as string[] };
        }
      } else if (current) {
        current.bullets.push(l.replace(bulletPattern, '').trim());
      }
    }
    if (current) items.push(current);
    return items.slice(0, 6);
  }

  function parseEducation(blocks: string[]) {
    const edu: any[] = [];
    const degreePattern = /(bachelor|master|mba|phd|b\.sc|m\.sc|bachelor’s|master’s)/i;
    for (const l of blocks) {
      if (!l) continue;
      const degree = (l.match(degreePattern) || [])[0] ?? '';
      edu.push({
        degree: degree || '',
        field: '',
        start_date: '',
        end_date: '',
        details: [l],
      });
      if (edu.length >= 4) break;
    }
    return edu;
  }

  const experience = parseWork(workLines.length ? workLines : lines).map((e) => ({
    company: e.company || null,
    title: e.title || null,
    start_date: e.start_date || null,
    end_date: e.end_date || null,
    location: e.location || null,
    bullets: (e.bullets || []).filter((b: string) => b),
  }));
  const education = parseEducation(educationLines);

  return {
    name: nameLine || '',
    contact_info: {
      email: emailMatch?.[0] || null,
      phone: phoneMatch?.[0]?.trim() || null,
      location: null,
      links: {
        linkedin: linkedinMatch?.[0] || null,
      },
    },
    summary: summary || null,
    education: education.map((e) => ({
      degree: e.degree || null,
      field: e.field || null,
      start_date: e.start_date || null,
      end_date: e.end_date || null,
      details: e.details || [],
    })),
    experience: experience.map((e) => ({
      company: e.company || null,
      title: e.title || null,
      start_date: e.start_date || null,
      end_date: e.end_date || null,
      location: e.location || null,
      bullets: e.bullets || [],
    })),
    skills,
  };
}

async function hydrateResume(resume: Resume, baseProfile?: BaseInfo) {
  let resumeText = resume.resumeText ?? '';
  if (!resumeText && resume.filePath) {
    const resolved = resolveResumePath(resume.filePath);
    resumeText = await extractResumeTextFromFile(resolved, path.basename(resume.filePath));
  }
  resumeText = sanitizeText(resumeText);
  return { ...resume, resumeText };
}

const DEFAULT_AUTOFILL_FIELDS = [
  { field_id: 'first_name', label: 'First name', type: 'text', required: true },
  { field_id: 'last_name', label: 'Last name', type: 'text', required: true },
  { field_id: 'email', label: 'Email', type: 'text', required: true },
  { field_id: 'phone', label: 'Phone', type: 'text', required: false },
  { field_id: 'city', label: 'City', type: 'text', required: false },
  { field_id: 'country', label: 'Country', type: 'text', required: false },
  { field_id: 'work_auth', label: 'Authorized to work?', type: 'checkbox', required: false },
  {
    field_id: 'cover_letter',
    label: 'Why are you a fit?',
    type: 'textarea',
    required: false,
    surrounding_text: 'brief pitch/cover letter, keep to 2-3 sentences',
  },
];

// initDb, auth guard, signToken live in dedicated modules

async function bootstrap() {
  await app.register(authGuard);
  await app.register(cors, { origin: true });
  await app.register(websocket);
  await initDb();
  await fs.mkdir(RESUME_DIR, { recursive: true });

  app.get('/health', async () => ({ status: 'ok' }));

  app.post('/auth/login', async (request, reply) => {
    const schema = z.object({ email: z.string().email(), password: z.string().optional() });
    const body = schema.parse(request.body);
    const user = await findUserByEmail(body.email);
    if (!user) {
      return reply.status(401).send({ message: 'Invalid credentials' });
    }
    if (user.password && body.password && !(await bcrypt.compare(body.password, user.password))) {
      return reply.status(401).send({ message: 'Invalid credentials' });
    }
    const token = signToken(user);
    return { token, user };
  });

  app.post('/auth/signup', async (request, reply) => {
    const schema = z.object({
      email: z.string().email(),
      password: z.string().min(3),
      name: z.string().min(2),
    });
    const body = schema.parse(request.body);
    const exists = await findUserByEmail(body.email);
    if (exists) {
      return reply.status(409).send({ message: 'Email already registered' });
    }
    const hashed = await bcrypt.hash(body.password, 8);
    const user: User = {
      id: randomUUID(),
      email: body.email,
      role: 'OBSERVER',
      name: body.name,
      isActive: true,
      password: hashed,
    };
    await insertUser(user);
    const token = signToken(user);
    return { token, user };
  });

  app.get('/profiles', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    const queryUserId = (request.query as { userId?: string }).userId;
    const targetUser = actor ?? (queryUserId ? await findUserById(queryUserId) : undefined);
    if (!targetUser || !targetUser.isActive) return [];

    if (targetUser.role === 'ADMIN' || targetUser.role === 'MANAGER') {
      return listProfiles();
    }
    if (targetUser.role === 'BIDDER') {
      return listProfilesForBidder(targetUser.id);
    }
    return [];
  });

  app.post('/profiles', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    if (!actor || (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')) {
      return reply.status(403).send({ message: 'Only managers or admins can create profiles' });
    }
    const schema = z.object({
      displayName: z.string().min(2),
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().email().optional(),
    });
    const body = schema.parse(request.body);
    const profileId = randomUUID();
    const now = new Date().toISOString();
    const baseInfo = {
      name: { first: body.firstName ?? '', last: body.lastName ?? '' },
      contact: { email: body.email ?? '' },
    };
    const profile = {
      id: profileId,
      displayName: body.displayName,
      baseInfo,
      createdBy: actor.id,
      createdAt: now,
      updatedAt: now,
    };
    await insertProfile(profile);
    return profile;
  });

  app.patch('/profiles/:id', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    if (!actor || (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')) {
      return reply.status(403).send({ message: 'Only managers or admins can update profiles' });
    }
    const { id } = request.params as { id: string };
    const existing = await findProfileById(id);
    if (!existing) return reply.status(404).send({ message: 'Profile not found' });

    const schema = z.object({
      displayName: z.string().min(2).optional(),
      baseInfo: z.record(z.any()).optional(),
    });
    const body = schema.parse(request.body ?? {});

    const incomingBase = (body.baseInfo ?? {}) as any;
    const mergedBase = {
      ...(existing.baseInfo ?? {}),
      ...(incomingBase || {}),
      name: { ...(existing.baseInfo?.name ?? {}), ...(incomingBase?.name ?? {}) },
      contact: { ...(existing.baseInfo?.contact ?? {}), ...(incomingBase?.contact ?? {}) },
      location: { ...(existing.baseInfo?.location ?? {}), ...(incomingBase?.location ?? {}) },
      workAuth: { ...(existing.baseInfo?.workAuth ?? {}), ...(incomingBase?.workAuth ?? {}) },
      links: { ...(existing.baseInfo?.links ?? {}), ...(incomingBase?.links ?? {}) },
      defaultAnswers: {
        ...(existing.baseInfo?.defaultAnswers ?? {}),
        ...(incomingBase?.defaultAnswers ?? {}),
      },
    };

    const updatedProfile = {
      ...existing,
      displayName: body.displayName ?? existing.displayName,
      baseInfo: mergedBase,
      updatedAt: new Date().toISOString(),
    };

    await updateProfileRecord({
      id: updatedProfile.id,
      displayName: updatedProfile.displayName,
      baseInfo: updatedProfile.baseInfo,
    });
    return updatedProfile;
  });

  app.get('/profiles/:id/resumes', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const profile = await findProfileById(id);
    if (!profile) return reply.status(404).send({ message: 'Profile not found' });
    return listResumesByProfile(id);
  });

  app.post('/profiles/:id/resumes', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    if (!actor || (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')) {
      return reply.status(403).send({ message: 'Only managers or admins can add resumes' });
    }
    const { id } = request.params as { id: string };
    const profile = await findProfileById(id);
    if (!profile) return reply.status(404).send({ message: 'Profile not found' });

    const schema = z.object({
      label: z.string().optional(),
      filePath: z.string().optional(),
      fileData: z.string().optional(),
      fileName: z.string().optional(),
      description: z.string().optional(),
    });
    const body = schema.parse(request.body ?? {});
    const baseLabel =
      body.label?.trim() ||
      (body.fileName ? body.fileName.replace(/\.[^/.]+$/, '').trim() : '') ||
      '';
    if (baseLabel.length < 2) {
      return reply.status(400).send({ message: 'Label is required (min 2 chars)' });
    }
    if (!body.fileData && !body.filePath) {
      return reply.status(400).send({ message: 'Resume file is required' });
    }
    const resumeId = randomUUID();
    let filePath = body.filePath ?? '';
    let resumeText = '';
    let resumeJson: Record<string, unknown> | undefined;
    let resolvedPath = '';
    if (body.fileData) {
      const buffer = Buffer.from(body.fileData, 'base64');
      const ext =
        body.fileName && path.extname(body.fileName) ? path.extname(body.fileName) : '.pdf';
      const fileName = `${resumeId}${ext}`;
      const targetPath = path.join(RESUME_DIR, fileName);
      await fs.writeFile(targetPath, buffer);
      filePath = `/data/resumes/${fileName}`;
      resolvedPath = targetPath;
    } else if (filePath) {
      resolvedPath = resolveResumePath(filePath);
    }

    if (resolvedPath) {
      resumeText = await extractResumeTextFromFile(resolvedPath, body.fileName ?? path.basename(resolvedPath));
      resumeJson = await tryParseResumeText(resumeId, resumeText, profile.baseInfo);
    }
    resumeText = sanitizeText(resumeText);
    const resumeDescription = body.description?.trim() || undefined;
    const resume = {
      id: resumeId,
      profileId: id,
      label: baseLabel,
      filePath,
      resumeText,
      resumeDescription,
      resumeJson,
      createdAt: new Date().toISOString(),
    };
    await insertResumeRecord(resume);
    return { ...resume, resumeJson };
  });

  app.delete('/profiles/:profileId/resumes/:resumeId', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    if (!actor || (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')) {
      return reply.status(403).send({ message: 'Only managers or admins can remove resumes' });
    }
    const { profileId, resumeId } = request.params as { profileId: string; resumeId: string };
    const profile = await findProfileById(profileId);
    if (!profile) return reply.status(404).send({ message: 'Profile not found' });
    const resume = await findResumeById(resumeId);
    if (!resume || resume.profileId !== profileId) {
      return reply.status(404).send({ message: 'Resume not found' });
    }
    if (resume.filePath) {
      try {
        const resolved = resolveResumePath(resume.filePath);
        if (resolved) await fs.unlink(resolved);
      } catch {
        // ignore missing files
      }
    }
    await deleteResumeById(resumeId);
    return { ok: true };
  });

  app.get('/resumes/:id/file', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    if (!actor || (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')) {
      return reply.status(403).send({ message: 'Only managers or admins can view resumes' });
    }
    const { id } = request.params as { id: string };
    const resume = await findResumeById(id);
    if (!resume || !resume.filePath) return reply.status(404).send({ message: 'Resume not found' });
    const resolvedPath = resolveResumePath(resume.filePath);
    if (!resolvedPath || !fsSync.existsSync(resolvedPath)) {
      return reply.status(404).send({ message: 'File missing' });
    }
    reply.header('Content-Type', 'application/pdf');
    const stream = fsSync.createReadStream(resolvedPath);
    return reply.send(stream);
  });

  app.get('/assignments', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    return listAssignments();
  });
  app.post('/assignments', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    if (!actor || (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')) {
      return reply.status(403).send({ message: 'Only managers or admins can assign profiles' });
    }
    const schema = z.object({
      profileId: z.string(),
      bidderUserId: z.string(),
      assignedBy: z.string().optional(),
    });
    const body = schema.parse(request.body);
    const profile = await findProfileById(body.profileId);
    const bidder = await findUserById(body.bidderUserId);
    if (!profile || !bidder || bidder.role !== 'BIDDER') {
      return reply.status(400).send({ message: 'Invalid profile or bidder' });
    }

    const existing = await findActiveAssignmentByProfile(body.profileId);
    if (existing) {
      return reply
        .status(409)
        .send({ message: 'Profile already assigned', assignmentId: existing.id });
    }

    const newAssignment = {
      id: randomUUID(),
      profileId: body.profileId,
      bidderUserId: body.bidderUserId,
      assignedBy: actor.id ?? body.assignedBy ?? body.bidderUserId,
      assignedAt: new Date().toISOString(),
      unassignedAt: null as string | null,
    };
    await insertAssignmentRecord(newAssignment);
    events.push({
      id: randomUUID(),
      sessionId: 'admin-event',
      eventType: 'ASSIGNED',
      payload: { profileId: body.profileId, bidderUserId: body.bidderUserId },
      createdAt: new Date().toISOString(),
    });
    return newAssignment;
  });

  app.post('/assignments/:id/unassign', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const assignment = await closeAssignmentById(id);
    if (!assignment) return reply.status(404).send({ message: 'Assignment not found' });
    events.push({
      id: randomUUID(),
      sessionId: 'admin-event',
      eventType: 'UNASSIGNED',
      payload: { profileId: assignment.profileId, bidderUserId: assignment.bidderUserId },
      createdAt: new Date().toISOString(),
    });
    return assignment;
  });

  app.get('/sessions/:id', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const session = sessions.find((s) => s.id === id);
    if (!session) return reply.status(404).send({ message: 'Session not found' });
    return session;
  });

  app.post('/sessions', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const schema = z.object({
      bidderUserId: z.string(),
      profileId: z.string(),
      url: z.string(),
      selectedResumeId: z.string().optional(),
    });
    const body = schema.parse(request.body);
    const profileAssignment = await findActiveAssignmentByProfile(body.profileId);
    if (profileAssignment && profileAssignment.bidderUserId !== body.bidderUserId) {
      return reply.status(403).send({ message: 'Profile not assigned to bidder' });
    }
    const session: ApplicationSession = {
      id: randomUUID(),
      bidderUserId: body.bidderUserId,
      profileId: body.profileId,
      url: body.url,
      domain: tryExtractDomain(body.url),
      status: 'OPEN',
      selectedResumeId: body.selectedResumeId,
      startedAt: new Date().toISOString(),
    };
    sessions.unshift(session);
    events.push({
      id: randomUUID(),
      sessionId: session.id,
      eventType: 'SESSION_CREATED',
      payload: { url: session.url },
      createdAt: new Date().toISOString(),
    });
    return session;
  });

  app.post('/sessions/:id/go', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const session = sessions.find((s) => s.id === id);
    if (!session) return reply.status(404).send({ message: 'Session not found' });
    session.status = 'OPEN';
    try {
      await startBrowserSession(session);
    } catch (err) {
      app.log.error({ err }, 'failed to start browser session');
    }
    events.push({
      id: randomUUID(),
      sessionId: id,
      eventType: 'GO_CLICKED',
      payload: { url: session.url },
      createdAt: new Date().toISOString(),
    });
    return { ok: true };
  });

  app.post('/sessions/:id/analyze', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const session = sessions.find((s) => s.id === id);
    if (!session) return reply.status(404).send({ message: 'Session not found' });
    const profileResumesList = await listResumesByProfile(session.profileId);
    const hydratedResumes = await Promise.all(profileResumesList.map((r) => hydrateResume(r)));
    const analysis = await analyzeJobFromUrl(
      session.url,
      hydratedResumes.map((r) => ({
        id: r.id,
        label: r.label,
        parsed: r.resumeJson ?? {},
        resume_text: r.resumeText ?? '',
      })),
    );

    session.recommendedResumeId = analysis.recommendedResumeId;
    session.status = 'ANALYZED';
    session.jobContext = {
      title: analysis.title || 'Job',
      company: 'N/A',
      summary: 'Analysis from job description',
      job_description_text: analysis.jobText ?? '',
    };
    events.push({
      id: randomUUID(),
      sessionId: id,
      eventType: 'ANALYZE_DONE',
      payload: { recommendedLabel: analysis.recommendedLabel, recommendedResumeId: analysis.recommendedResumeId },
      createdAt: new Date().toISOString(),
    });
    return {
      recommendedResumeId: analysis.recommendedResumeId,
      recommendedLabel: analysis.recommendedLabel,
      ranked: analysis.ranked.map((r, idx) => ({
        id: r.id ?? `${r.label}-${idx}`,
        label: r.label,
        rank: idx + 1,
        score: r.score,
      })),
      scores: analysis.rawScores,
      jobContext: session.jobContext,
    };
  });

  // Prompt-pack endpoints (HF-backed)
  app.post('/llm/resume-parse', async (request, reply) => {
    const { resumeText, resumeId, filename, baseProfile } = request.body as any;
    if (!resumeText || !resumeId) return reply.status(400).send({ message: 'resumeText and resumeId are required' });
    const prompt = promptBuilders.buildResumeParsePrompt({
      resumeId,
      filename,
      resumeText,
      baseProfile,
    });
    const parsed = await callPromptPack(prompt);
    if (!parsed) return reply.status(502).send({ message: 'LLM parse failed' });
    return parsed;
  });

  app.post('/llm/job-analyze', async (request, reply) => {
    const { job, baseProfile, prefs } = request.body as any;
    if (!job?.job_description_text) return reply.status(400).send({ message: 'job_description_text required' });
    const prompt = promptBuilders.buildJobAnalyzePrompt({
      job,
      baseProfile,
      prefs,
    });
    const parsed = await callPromptPack(prompt);
    if (!parsed) return reply.status(502).send({ message: 'LLM analyze failed' });
    return parsed;
  });

  app.post('/llm/rank-resumes', async (request, reply) => {
    const { job, resumes, baseProfile, prefs } = request.body as any;
    if (!job?.job_description_text || !Array.isArray(resumes)) {
      return reply.status(400).send({ message: 'job_description_text and resumes[] required' });
    }
    const prompt = promptBuilders.buildRankResumesPrompt({
      job,
      resumes,
      baseProfile,
      prefs,
    });
    const parsed = await callPromptPack(prompt);
    if (!parsed) return reply.status(502).send({ message: 'LLM rank failed' });
    return parsed;
  });

  app.post('/llm/autofill-plan', async (request, reply) => {
    const { pageFields, baseProfile, prefs, jobContext, selectedResume, pageContext } = request.body as any;
    if (!Array.isArray(pageFields)) return reply.status(400).send({ message: 'pageFields[] required' });
    const prompt = promptBuilders.buildAutofillPlanPrompt({
      pageFields,
      baseProfile,
      prefs,
      jobContext,
      selectedResume,
      pageContext,
    });
    const parsed = await callPromptPack(prompt);
    if (!parsed) return reply.status(502).send({ message: 'LLM autofill failed' });
    return parsed;
  });

  app.post('/sessions/:id/autofill', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const body = (request.body as { selectedResumeId?: string; pageFields?: any[] }) ?? {};
    const session = sessions.find((s) => s.id === id);
    if (!session) return reply.status(404).send({ message: 'Session not found' });
    const profile = await findProfileById(session.profileId);
    if (!profile) return reply.status(404).send({ message: 'Profile not found' });
    if (body.selectedResumeId) {
      session.selectedResumeId = body.selectedResumeId;
    }

    const profileResumes = await listResumesByProfile(session.profileId);
    const resumeId =
      session.selectedResumeId ?? session.recommendedResumeId ?? body.selectedResumeId ?? profileResumes[0]?.id;
    const resumeRecord = resumeId ? await findResumeById(resumeId) : undefined;
    const hydratedResume = resumeRecord ? await hydrateResume(resumeRecord, profile.baseInfo) : undefined;

    let fillPlan = buildDemoFillPlan(profile.baseInfo);
    try {
      const pageFields = Array.isArray(body.pageFields) && body.pageFields.length > 0 ? body.pageFields : DEFAULT_AUTOFILL_FIELDS;
      if (hydratedResume?.resumeText) {
        const prompt = promptBuilders.buildAutofillPlanPrompt({
          pageFields,
          baseProfile: profile.baseInfo ?? {},
          prefs: {},
          jobContext: session.jobContext ?? {},
          selectedResume: {
            resume_id: hydratedResume.id,
            label: hydratedResume.label,
            parsed_resume_json: hydratedResume.resumeJson ?? {},
            resume_text: hydratedResume.resumeText,
          },
          pageContext: { url: session.url },
        });
        const parsed = await callPromptPack(prompt);
        const llmPlan = parsed?.result?.fill_plan;
        if (Array.isArray(llmPlan)) {
          const filled = llmPlan
            .filter((f: any) => (f.action === 'fill' || f.action === 'select') && f.value)
            .map((f: any) => ({
              field: f.field_id ?? f.selector ?? f.label ?? 'field',
              value: typeof f.value === 'string' ? f.value : JSON.stringify(f.value ?? ''),
              confidence: typeof f.confidence === 'number' ? f.confidence : undefined,
            }));
          const suggestions =
            (Array.isArray(parsed?.warnings) ? parsed?.warnings : []).map((w: any) => ({
              field: 'note',
              suggestion: String(w),
            })) ?? [];
          const blocked = llmPlan
            .filter((f: any) => f.requires_user_review)
            .map((f: any) => f.field_id ?? f.selector ?? 'field');
          fillPlan = { filled, suggestions, blocked };
        }
      }
    } catch (err) {
      request.log.error({ err }, 'LLM autofill failed, using demo plan');
    }

    session.status = 'FILLED';
    session.selectedResumeId = resumeId ?? session.selectedResumeId;
    session.fillPlan = fillPlan;
    events.push({
      id: randomUUID(),
      sessionId: id,
      eventType: 'AUTOFILL_DONE',
      payload: session.fillPlan,
      createdAt: new Date().toISOString(),
    });
    return { fillPlan: session.fillPlan };
  });

  app.post('/sessions/:id/mark-submitted', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const session = sessions.find((s) => s.id === id);
    if (!session) return reply.status(404).send({ message: 'Session not found' });
    session.status = 'SUBMITTED';
    session.endedAt = new Date().toISOString();
    await stopBrowserSession(id);
    events.push({
      id: randomUUID(),
      sessionId: id,
      eventType: 'SUBMITTED',
      createdAt: new Date().toISOString(),
    });
    return { status: session.status };
  });

  app.get('/sessions', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const bidderUserId = (request.query as { bidderUserId?: string }).bidderUserId;
    const filtered = bidderUserId
      ? sessions.filter((s) => s.bidderUserId === bidderUserId)
      : sessions;
    return filtered;
  });

  app.get('/users', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { role } = request.query as { role?: string };
    const roleFilter = role ? role.toUpperCase() : null;

    const baseSql = `
      SELECT id, email, name, role, is_active as "isActive"
      FROM users
      WHERE is_active = TRUE
    `;

    const sql = roleFilter
      ? `${baseSql} AND role = $1 ORDER BY created_at ASC`
      : `${baseSql} AND role <> 'OBSERVER' ORDER BY created_at ASC`;

    const params = roleFilter ? [roleFilter] : [];
    const { rows } = await pool.query<User>(sql, params);
    return rows;
  });

  app.patch('/users/:id/role', async (request, reply) => {
    const actor = request.authUser;
    if (!actor || actor.role !== 'ADMIN') {
      return reply.status(403).send({ message: 'Only admins can update roles' });
    }
    const { id } = request.params as { id: string };
    const schema = z.object({ role: z.enum(['ADMIN', 'MANAGER', 'BIDDER', 'OBSERVER']) });
    const body = schema.parse(request.body);
    await pool.query('UPDATE users SET role = $1 WHERE id = $2', [body.role, id]);
    const updated = await findUserById(id);
    return updated;
  });

  app.get('/metrics/my', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const bidderUserId = (request.query as { bidderUserId?: string }).bidderUserId;
    const userSessions = bidderUserId
      ? sessions.filter((s) => s.bidderUserId === bidderUserId)
      : sessions;
    const tried = userSessions.length;
    const submitted = userSessions.filter((s) => s.status === 'SUBMITTED').length;
    const percentage = tried === 0 ? 0 : Math.round((submitted / tried) * 100);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthlyApplied = userSessions.filter(
      (s) =>
        s.status === 'SUBMITTED' &&
        s.startedAt &&
        new Date(s.startedAt).getTime() >= monthStart.getTime(),
    ).length;
    return {
      tried,
      submitted,
      appliedPercentage: percentage,
      monthlyApplied,
      recent: userSessions.slice(0, 5),
    };
  });

  app.get('/settings/llm', async () => llmSettings[0]);
  app.post('/settings/llm', async (request) => {
    const schema = z.object({
      provider: z.enum(['OPENAI', 'HUGGINGFACE']),
      chatModel: z.string(),
      embedModel: z.string(),
      encryptedApiKey: z.string(),
    });
    const body = schema.parse(request.body);
    const current = llmSettings[0];
    llmSettings[0] = {
      ...current,
      ...body,
      updatedAt: new Date().toISOString(),
    };
    return llmSettings[0];
  });

  app.get('/manager/bidders/summary', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const actor = request.authUser;
    if (!actor || (actor.role !== 'MANAGER' && actor.role !== 'ADMIN')) {
      return reply.status(403).send({ message: 'Only managers or admins can view bidders' });
    }
    const rows = await listBidderSummaries();
    return rows;
  });

  app.ready((err) => {
    if (err) app.log.error(err);
  });

  app.listen({ port: PORT, host: '0.0.0.0' }, (err) => {
    if (err) {
      app.log.error(err);
      process.exit(1);
    }
    app.log.info(`API running on http://localhost:${PORT}`);
  });

  app.get('/ws/browser/:sessionId', { websocket: true }, async (connection, req) => {
    // Allow ws without auth for now to keep demo functional
    const { sessionId } = req.params as { sessionId: string };
    const live = livePages.get(sessionId);
    if (!live) {
      connection.socket.send(JSON.stringify({ type: 'error', message: 'No live browser' }));
      connection.socket.close();
      return;
    }

    const { page } = live;
    const sendFrame = async () => {
      try {
        const buf = await page.screenshot({ fullPage: true });
        connection.socket.send(
          JSON.stringify({ type: 'frame', data: buf.toString('base64') }),
        );
      } catch (err) {
        connection.socket.send(
          JSON.stringify({ type: 'error', message: 'Could not capture frame' }),
        );
      }
    };

    // Send frames every second
    const interval = setInterval(sendFrame, 1000);
    livePages.set(sessionId, { ...live, interval });

    connection.socket.on('close', () => {
      clearInterval(interval);
      const current = livePages.get(sessionId);
      if (current) {
        livePages.set(sessionId, { browser: current.browser, page: current.page });
      }
    });
  });
}

function tryExtractDomain(url: string) {
  try {
    const u = new URL(url);
    return u.hostname;
  } catch {
    return undefined;
  }
}

function buildDemoFillPlan(baseInfo: BaseInfo) {
  const safeFields = [
    { field: 'first_name', value: baseInfo?.name?.first, confidence: 0.98 },
    { field: 'last_name', value: baseInfo?.name?.last, confidence: 0.98 },
    { field: 'email', value: baseInfo?.contact?.email, confidence: 0.97 },
    { field: 'phone', value: baseInfo?.contact?.phone, confidence: 0.8 },
  ];
  return {
    filled: safeFields.filter((f) => f.value),
    suggestions: [{ field: 'cover_letter', suggestion: 'Short note about relevant skills' }],
    blocked: ['EEO', 'veteran_status', 'disability'],
  };
}

function resolveResumePath(p: string) {
  if (!p) return '';
  if (path.isAbsolute(p)) {
    // If an absolute path was previously stored, fall back to the shared resumes directory using the filename.
    const fileName = path.basename(p);
    return path.join(RESUME_DIR, fileName);
  }
  const normalized = p.replace(/\\/g, '/');
  if (normalized.startsWith('/data/resumes/')) {
    const fileName = normalized.split('/').pop() ?? '';
    return path.join(RESUME_DIR, fileName);
  }
  if (normalized.startsWith('/resumes/')) {
    const fileName = normalized.split('/').pop() ?? '';
    return path.join(RESUME_DIR, fileName);
  }
  const trimmed = normalized.replace(/^\.?\\?\//, '');
  return path.join(PROJECT_ROOT, trimmed);
}

bootstrap();

async function startBrowserSession(session: ApplicationSession) {
  const existing = livePages.get(session.id);
  if (existing) {
    await existing.page.goto(session.url, { waitUntil: 'domcontentloaded' });
    await focusFirstField(existing.page);
    return;
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
  await page.goto(session.url, { waitUntil: 'domcontentloaded' });
  await focusFirstField(page);
  livePages.set(session.id, { browser, page });
}

async function stopBrowserSession(sessionId: string) {
  const live = livePages.get(sessionId);
  if (!live) return;
  if (live.interval) clearInterval(live.interval);
  await live.page.close().catch(() => undefined);
  await live.browser.close().catch(() => undefined);
  livePages.delete(sessionId);
}

async function focusFirstField(page: Page) {
  try {
    const locator = page.locator('input, textarea, select').first();
    await locator.scrollIntoViewIfNeeded({ timeout: 4000 });
  } catch {
    // ignore
  }
}
