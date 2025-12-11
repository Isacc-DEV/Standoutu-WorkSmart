"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.initDb = initDb;
exports.findUserByEmail = findUserByEmail;
exports.findUserById = findUserById;
exports.insertUser = insertUser;
const pg_1 = require("pg");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const data_1 = require("./data");
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
});
async function initDb() {
    const client = await exports.pool.connect();
    try {
        await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL,
        password TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS profiles (
        id UUID PRIMARY KEY,
        display_name TEXT NOT NULL,
        base_info JSONB DEFAULT '{}'::jsonb,
        created_by UUID,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS resumes (
        id UUID PRIMARY KEY,
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        label TEXT NOT NULL,
        file_path TEXT,
        resume_text TEXT,
        resume_json JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS assignments (
        id UUID PRIMARY KEY,
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        bidder_user_id UUID REFERENCES users(id) ON DELETE CASCADE,
        assigned_by UUID REFERENCES users(id),
        assigned_at TIMESTAMP DEFAULT NOW(),
        unassigned_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id UUID PRIMARY KEY,
        bidder_user_id UUID REFERENCES users(id),
        profile_id UUID REFERENCES profiles(id),
        url TEXT,
        domain TEXT,
        status TEXT,
        recommended_resume_id UUID,
        selected_resume_id UUID,
        job_context JSONB,
        form_schema JSONB,
        fill_plan JSONB,
        started_at TIMESTAMP,
        ended_at TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY,
        session_id UUID,
        event_type TEXT,
        payload JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS llm_settings (
        id UUID PRIMARY KEY,
        owner_type TEXT,
        owner_id TEXT,
        provider TEXT,
        encrypted_api_key TEXT,
        chat_model TEXT,
        embed_model TEXT,
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
        for (const u of data_1.users) {
            const hashed = await bcryptjs_1.default.hash(u.password || 'demo', 8);
            await client.query(`
          INSERT INTO users (id, email, name, role, password, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (email) DO NOTHING;
        `, [u.id, u.email, u.name, u.role, hashed, u.isActive ?? true]);
        }
        for (const p of data_1.profiles) {
            await client.query(`
          INSERT INTO profiles (id, display_name, base_info, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING;
        `, [p.id, p.displayName, JSON.stringify(p.baseInfo ?? {}), p.createdBy, p.createdAt, p.updatedAt]);
        }
        for (const r of data_1.resumes) {
            await client.query(`
          INSERT INTO resumes (id, profile_id, label, file_path, resume_text, resume_json, created_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING;
        `, [r.id, r.profileId, r.label, r.filePath, r.resumeText, JSON.stringify(r.resumeJson ?? {}), r.createdAt]);
        }
        for (const a of data_1.assignments) {
            await client.query(`
          INSERT INTO assignments (id, profile_id, bidder_user_id, assigned_by, assigned_at, unassigned_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING;
        `, [a.id, a.profileId, a.bidderUserId, a.assignedBy, a.assignedAt, a.unassignedAt]);
        }
        for (const l of data_1.llmSettings) {
            await client.query(`
          INSERT INTO llm_settings (id, owner_type, owner_id, provider, encrypted_api_key, chat_model, embed_model, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING;
        `, [l.id, l.ownerType, l.ownerId, l.provider, l.encryptedApiKey, l.chatModel, l.embedModel, l.updatedAt]);
        }
    }
    finally {
        client.release();
    }
}
async function findUserByEmail(email) {
    const { rows } = await exports.pool.query('SELECT id, email, name, role, is_active as "isActive", password FROM users WHERE email = $1', [email]);
    return rows[0];
}
async function findUserById(id) {
    const { rows } = await exports.pool.query('SELECT id, email, name, role, is_active as "isActive", password FROM users WHERE id = $1', [id]);
    return rows[0];
}
async function insertUser(user) {
    await exports.pool.query(`
      INSERT INTO users (id, email, name, role, password, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password = EXCLUDED.password, is_active = EXCLUDED.is_active
    `, [user.id, user.email, user.name, user.role, user.password ?? 'demo', user.isActive ?? true]);
}
