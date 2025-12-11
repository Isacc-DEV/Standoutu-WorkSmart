import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { randomUUID } from 'crypto';
import { z } from 'zod';
import { chromium, Browser, Page } from 'playwright';
import bcrypt from 'bcryptjs';
import { assignments, events, llmSettings, profiles, resumes, sessions } from './data';
import { ApplicationSession, BaseInfo, SessionStatus, User, UserRole } from './types';
import { authGuard, forbidObserver, signToken } from './auth';
import { findUserByEmail, findUserById, initDb, insertProfile, insertUser, listBidderSummaries, pool } from './db';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const app = fastify({ logger: true });

const livePages = new Map<
  string,
  { browser: Browser; page: Page; interval?: NodeJS.Timeout }
>();

// initDb, auth guard, signToken live in dedicated modules

async function bootstrap() {
  await app.register(authGuard);
  await app.register(cors, { origin: true });
  await app.register(websocket);
  await initDb();

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
    const userId = (request.query as { userId?: string }).userId;
    if (!userId) return profiles;
    const user = await findUserById(userId);
    if (!user || !user.isActive) return [];
    if (user.role === 'ADMIN' || user.role === 'MANAGER') return profiles;
    const assignedProfileIds = assignments
      .filter((a) => a.bidderUserId === userId && !a.unassignedAt)
      .map((a) => a.profileId);
    return profiles.filter((p) => assignedProfileIds.includes(p.id));
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
    profiles.unshift(profile);
    await insertProfile(profile);
    return profile;
  });

  app.get('/profiles/:id/resumes', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return reply.status(404).send({ message: 'Profile not found' });
    return resumes.filter((r) => r.profileId === id);
  });

  app.get('/assignments', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    return assignments;
  });
  app.post('/assignments', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const schema = z.object({
      profileId: z.string(),
      bidderUserId: z.string(),
      assignedBy: z.string(),
    });
    const body = schema.parse(request.body);
    const profile = profiles.find((p) => p.id === body.profileId);
    const bidder = await findUserById(body.bidderUserId);
    if (!bidder || bidder.role !== 'BIDDER') return reply.status(400).send({ message: 'Invalid profile or bidder' });
    if (!profile || !bidder) return reply.status(400).send({ message: 'Invalid profile or bidder' });

    const existing = assignments.find(
      (a) => a.profileId === body.profileId && !a.unassignedAt,
    );
    if (existing) {
      return reply
        .status(409)
        .send({ message: 'Profile already assigned', assignmentId: existing.id });
    }

    const newAssignment = {
      id: randomUUID(),
      profileId: body.profileId,
      bidderUserId: body.bidderUserId,
      assignedBy: body.assignedBy,
      assignedAt: new Date().toISOString(),
      unassignedAt: null as string | null,
    };
    assignments.unshift(newAssignment);
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
    const assignment = assignments.find((a) => a.id === id && !a.unassignedAt);
    if (!assignment) return reply.status(404).send({ message: 'Assignment not found' });
    assignment.unassignedAt = new Date().toISOString();
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
    const profileAssignment = assignments.find(
      (a) => a.profileId === body.profileId && !a.unassignedAt,
    );
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
    const profileResumes = resumes.filter((r) => r.profileId === session.profileId);
    const recommended = profileResumes[0];
    session.recommendedResumeId = recommended?.id;
    session.status = 'ANALYZED';
    session.jobContext = {
      title: 'Sample Job',
      company: 'Demo Corp',
      summary: 'Placeholder job context for MVP.',
    };
    events.push({
      id: randomUUID(),
      sessionId: id,
      eventType: 'ANALYZE_DONE',
      payload: { recommendedResumeId: session.recommendedResumeId },
      createdAt: new Date().toISOString(),
    });
    return {
      recommendedResumeId: session.recommendedResumeId,
      alternatives: profileResumes.map((r) => ({ id: r.id, label: r.label })),
      jobContext: session.jobContext,
    };
  });

  app.post('/sessions/:id/autofill', async (request, reply) => {
    if (forbidObserver(reply, request.authUser)) return;
    const { id } = request.params as { id: string };
    const session = sessions.find((s) => s.id === id);
    if (!session) return reply.status(404).send({ message: 'Session not found' });
    const profile = profiles.find((p) => p.id === session.profileId);
    if (!profile) return reply.status(404).send({ message: 'Profile not found' });
    session.status = 'FILLED';
    session.fillPlan = buildDemoFillPlan(profile.baseInfo);
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
    const { rows } = await pool.query<User>(
      'SELECT id, email, name, role, is_active as "isActive" FROM users ORDER BY created_at ASC',
    );
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
