"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fastify_1 = __importDefault(require("fastify"));
const cors_1 = __importDefault(require("@fastify/cors"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const crypto_1 = require("crypto");
const zod_1 = require("zod");
const playwright_1 = require("playwright");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const data_1 = require("./data");
const auth_1 = require("./auth");
const db_1 = require("./db");
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const memoryUsers = data_1.users;
const app = (0, fastify_1.default)({ logger: true });
const livePages = new Map();
// initDb, auth guard, signToken live in dedicated modules
async function bootstrap() {
    await app.register(auth_1.authGuard);
    await app.register(cors_1.default, { origin: true });
    await app.register(websocket_1.default);
    await (0, db_1.initDb)();
    app.get('/health', async () => ({ status: 'ok' }));
    app.post('/auth/login', async (request, reply) => {
        const schema = zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string().optional() });
        const body = schema.parse(request.body);
        const user = await (0, db_1.findUserByEmail)(body.email);
        if (!user) {
            return reply.status(401).send({ message: 'Invalid credentials' });
        }
        if (user.password && body.password && !(await bcryptjs_1.default.compare(body.password, user.password))) {
            return reply.status(401).send({ message: 'Invalid credentials' });
        }
        const token = (0, auth_1.signToken)(user);
        return { token, user };
    });
    app.post('/auth/signup', async (request, reply) => {
        const schema = zod_1.z.object({
            email: zod_1.z.string().email(),
            password: zod_1.z.string().min(3),
            name: zod_1.z.string().min(2),
        });
        const body = schema.parse(request.body);
        const exists = await (0, db_1.findUserByEmail)(body.email);
        if (exists) {
            return reply.status(409).send({ message: 'Email already registered' });
        }
        const hashed = await bcryptjs_1.default.hash(body.password, 8);
        const user = {
            id: (0, crypto_1.randomUUID)(),
            email: body.email,
            role: 'OBSERVER',
            name: body.name,
            isActive: true,
            password: hashed,
        };
        memoryUsers.push({ ...user, password: undefined });
        await (0, db_1.insertUser)(user);
        const token = (0, auth_1.signToken)(user);
        return { token, user };
    });
    app.get('/profiles', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const userId = request.query.userId;
        if (!userId)
            return data_1.profiles;
        const user = memoryUsers.find((u) => u.id === userId);
        if (!user || !user.isActive)
            return [];
        if (user.role === 'ADMIN' || user.role === 'MANAGER')
            return data_1.profiles;
        const assignedProfileIds = data_1.assignments
            .filter((a) => a.bidderUserId === userId && !a.unassignedAt)
            .map((a) => a.profileId);
        return data_1.profiles.filter((p) => assignedProfileIds.includes(p.id));
    });
    app.get('/profiles/:id/resumes', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { id } = request.params;
        const profile = data_1.profiles.find((p) => p.id === id);
        if (!profile)
            return reply.status(404).send({ message: 'Profile not found' });
        return data_1.resumes.filter((r) => r.profileId === id);
    });
    app.get('/assignments', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        return data_1.assignments;
    });
    app.post('/assignments', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const schema = zod_1.z.object({
            profileId: zod_1.z.string(),
            bidderUserId: zod_1.z.string(),
            assignedBy: zod_1.z.string(),
        });
        const body = schema.parse(request.body);
        const profile = data_1.profiles.find((p) => p.id === body.profileId);
        const bidder = memoryUsers.find((u) => u.id === body.bidderUserId && u.role === 'BIDDER');
        if (!profile || !bidder)
            return reply.status(400).send({ message: 'Invalid profile or bidder' });
        const existing = data_1.assignments.find((a) => a.profileId === body.profileId && !a.unassignedAt);
        if (existing) {
            return reply
                .status(409)
                .send({ message: 'Profile already assigned', assignmentId: existing.id });
        }
        const newAssignment = {
            id: (0, crypto_1.randomUUID)(),
            profileId: body.profileId,
            bidderUserId: body.bidderUserId,
            assignedBy: body.assignedBy,
            assignedAt: new Date().toISOString(),
            unassignedAt: null,
        };
        data_1.assignments.unshift(newAssignment);
        data_1.events.push({
            id: (0, crypto_1.randomUUID)(),
            sessionId: 'admin-event',
            eventType: 'ASSIGNED',
            payload: { profileId: body.profileId, bidderUserId: body.bidderUserId },
            createdAt: new Date().toISOString(),
        });
        return newAssignment;
    });
    app.post('/assignments/:id/unassign', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { id } = request.params;
        const assignment = data_1.assignments.find((a) => a.id === id && !a.unassignedAt);
        if (!assignment)
            return reply.status(404).send({ message: 'Assignment not found' });
        assignment.unassignedAt = new Date().toISOString();
        data_1.events.push({
            id: (0, crypto_1.randomUUID)(),
            sessionId: 'admin-event',
            eventType: 'UNASSIGNED',
            payload: { profileId: assignment.profileId, bidderUserId: assignment.bidderUserId },
            createdAt: new Date().toISOString(),
        });
        return assignment;
    });
    app.get('/sessions/:id', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { id } = request.params;
        const session = data_1.sessions.find((s) => s.id === id);
        if (!session)
            return reply.status(404).send({ message: 'Session not found' });
        return session;
    });
    app.post('/sessions', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const schema = zod_1.z.object({
            bidderUserId: zod_1.z.string(),
            profileId: zod_1.z.string(),
            url: zod_1.z.string(),
            selectedResumeId: zod_1.z.string().optional(),
        });
        const body = schema.parse(request.body);
        const profileAssignment = data_1.assignments.find((a) => a.profileId === body.profileId && !a.unassignedAt);
        if (profileAssignment && profileAssignment.bidderUserId !== body.bidderUserId) {
            return reply.status(403).send({ message: 'Profile not assigned to bidder' });
        }
        const session = {
            id: (0, crypto_1.randomUUID)(),
            bidderUserId: body.bidderUserId,
            profileId: body.profileId,
            url: body.url,
            domain: tryExtractDomain(body.url),
            status: 'OPEN',
            selectedResumeId: body.selectedResumeId,
            startedAt: new Date().toISOString(),
        };
        data_1.sessions.unshift(session);
        data_1.events.push({
            id: (0, crypto_1.randomUUID)(),
            sessionId: session.id,
            eventType: 'SESSION_CREATED',
            payload: { url: session.url },
            createdAt: new Date().toISOString(),
        });
        return session;
    });
    app.post('/sessions/:id/go', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { id } = request.params;
        const session = data_1.sessions.find((s) => s.id === id);
        if (!session)
            return reply.status(404).send({ message: 'Session not found' });
        session.status = 'OPEN';
        try {
            await startBrowserSession(session);
        }
        catch (err) {
            app.log.error({ err }, 'failed to start browser session');
        }
        data_1.events.push({
            id: (0, crypto_1.randomUUID)(),
            sessionId: id,
            eventType: 'GO_CLICKED',
            payload: { url: session.url },
            createdAt: new Date().toISOString(),
        });
        return { ok: true };
    });
    app.post('/sessions/:id/analyze', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { id } = request.params;
        const session = data_1.sessions.find((s) => s.id === id);
        if (!session)
            return reply.status(404).send({ message: 'Session not found' });
        const profileResumes = data_1.resumes.filter((r) => r.profileId === session.profileId);
        const recommended = profileResumes[0];
        session.recommendedResumeId = recommended?.id;
        session.status = 'ANALYZED';
        session.jobContext = {
            title: 'Sample Job',
            company: 'Demo Corp',
            summary: 'Placeholder job context for MVP.',
        };
        data_1.events.push({
            id: (0, crypto_1.randomUUID)(),
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
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { id } = request.params;
        const session = data_1.sessions.find((s) => s.id === id);
        if (!session)
            return reply.status(404).send({ message: 'Session not found' });
        const profile = data_1.profiles.find((p) => p.id === session.profileId);
        if (!profile)
            return reply.status(404).send({ message: 'Profile not found' });
        session.status = 'FILLED';
        session.fillPlan = buildDemoFillPlan(profile.baseInfo);
        data_1.events.push({
            id: (0, crypto_1.randomUUID)(),
            sessionId: id,
            eventType: 'AUTOFILL_DONE',
            payload: session.fillPlan,
            createdAt: new Date().toISOString(),
        });
        return { fillPlan: session.fillPlan };
    });
    app.post('/sessions/:id/mark-submitted', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { id } = request.params;
        const session = data_1.sessions.find((s) => s.id === id);
        if (!session)
            return reply.status(404).send({ message: 'Session not found' });
        session.status = 'SUBMITTED';
        session.endedAt = new Date().toISOString();
        await stopBrowserSession(id);
        data_1.events.push({
            id: (0, crypto_1.randomUUID)(),
            sessionId: id,
            eventType: 'SUBMITTED',
            createdAt: new Date().toISOString(),
        });
        return { status: session.status };
    });
    app.get('/sessions', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const bidderUserId = request.query.bidderUserId;
        const filtered = bidderUserId
            ? data_1.sessions.filter((s) => s.bidderUserId === bidderUserId)
            : data_1.sessions;
        return filtered;
    });
    app.get('/users', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const { rows } = await db_1.pool.query('SELECT id, email, name, role, is_active as "isActive" FROM users ORDER BY created_at ASC');
        return rows;
    });
    app.get('/metrics/my', async (request, reply) => {
        if ((0, auth_1.forbidObserver)(reply, request.authUser))
            return;
        const bidderUserId = request.query.bidderUserId;
        const userSessions = bidderUserId
            ? data_1.sessions.filter((s) => s.bidderUserId === bidderUserId)
            : data_1.sessions;
        const tried = userSessions.length;
        const submitted = userSessions.filter((s) => s.status === 'SUBMITTED').length;
        const percentage = tried === 0 ? 0 : Math.round((submitted / tried) * 100);
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthlyApplied = userSessions.filter((s) => s.status === 'SUBMITTED' &&
            s.startedAt &&
            new Date(s.startedAt).getTime() >= monthStart.getTime()).length;
        return {
            tried,
            submitted,
            appliedPercentage: percentage,
            monthlyApplied,
            recent: userSessions.slice(0, 5),
        };
    });
    app.get('/settings/llm', async () => data_1.llmSettings[0]);
    app.post('/settings/llm', async (request) => {
        const schema = zod_1.z.object({
            provider: zod_1.z.enum(['OPENAI', 'HUGGINGFACE']),
            chatModel: zod_1.z.string(),
            embedModel: zod_1.z.string(),
            encryptedApiKey: zod_1.z.string(),
        });
        const body = schema.parse(request.body);
        const current = data_1.llmSettings[0];
        data_1.llmSettings[0] = {
            ...current,
            ...body,
            updatedAt: new Date().toISOString(),
        };
        return data_1.llmSettings[0];
    });
    app.ready((err) => {
        if (err)
            app.log.error(err);
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
        const { sessionId } = req.params;
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
                connection.socket.send(JSON.stringify({ type: 'frame', data: buf.toString('base64') }));
            }
            catch (err) {
                connection.socket.send(JSON.stringify({ type: 'error', message: 'Could not capture frame' }));
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
function tryExtractDomain(url) {
    try {
        const u = new URL(url);
        return u.hostname;
    }
    catch {
        return undefined;
    }
}
function buildDemoFillPlan(baseInfo) {
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
async function startBrowserSession(session) {
    const existing = livePages.get(session.id);
    if (existing) {
        await existing.page.goto(session.url, { waitUntil: 'domcontentloaded' });
        await focusFirstField(existing.page);
        return;
    }
    const browser = await playwright_1.chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 1400 } });
    await page.goto(session.url, { waitUntil: 'domcontentloaded' });
    await focusFirstField(page);
    livePages.set(session.id, { browser, page });
}
async function stopBrowserSession(sessionId) {
    const live = livePages.get(sessionId);
    if (!live)
        return;
    if (live.interval)
        clearInterval(live.interval);
    await live.page.close().catch(() => undefined);
    await live.browser.close().catch(() => undefined);
    livePages.delete(sessionId);
}
async function focusFirstField(page) {
    try {
        const locator = page.locator('input, textarea, select').first();
        await locator.scrollIntoViewIfNeeded({ timeout: 4000 });
    }
    catch {
        // ignore
    }
}
