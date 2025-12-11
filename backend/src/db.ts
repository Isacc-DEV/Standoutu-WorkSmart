import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import {
  assignments,
  llmSettings,
  profiles,
  resumes,
  profileResumes,
  users as seedUsers,
} from './data';
import { ProfileResume, Resume, User } from './types';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export async function initDb() {
  const client = await pool.connect();
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
        label TEXT NOT NULL,
        file_path TEXT,
        resume_text TEXT,
        resume_json JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS profile_resumes (
        id UUID PRIMARY KEY,
        profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
        resume_id UUID REFERENCES resumes(id) ON DELETE CASCADE,
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

    for (const u of seedUsers) {
      const hashed = await bcrypt.hash(u.password || 'demo', 8);
      await client.query(
        `
          INSERT INTO users (id, email, name, role, password, is_active)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (email) DO NOTHING;
        `,
        [u.id, u.email, u.name, u.role, hashed, u.isActive ?? true],
      );
    }

    for (const p of profiles) {
      await client.query(
        `
          INSERT INTO profiles (id, display_name, base_info, created_by, created_at, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING;
        `,
        [p.id, p.displayName, JSON.stringify(p.baseInfo ?? {}), p.createdBy, p.createdAt, p.updatedAt],
      );
    }

    for (const r of resumes) {
      await client.query(
        `
          INSERT INTO resumes (id, label, file_path, resume_text, resume_json, created_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING;
        `,
        [r.id, r.label, r.filePath, r.resumeText, JSON.stringify(r.resumeJson ?? {}), r.createdAt],
      );
    }

    for (const pr of profileResumes) {
      await client.query(
        `
          INSERT INTO profile_resumes (id, profile_id, resume_id, created_at)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO NOTHING;
        `,
        [pr.id, pr.profileId, pr.resumeId, pr.createdAt],
      );
    }

    for (const a of assignments) {
      await client.query(
        `
          INSERT INTO assignments (id, profile_id, bidder_user_id, assigned_by, assigned_at, unassigned_at)
          VALUES ($1, $2, $3, $4, $5, $6)
          ON CONFLICT (id) DO NOTHING;
        `,
        [a.id, a.profileId, a.bidderUserId, a.assignedBy, a.assignedAt, a.unassignedAt],
      );
    }

    for (const l of llmSettings) {
      await client.query(
        `
          INSERT INTO llm_settings (id, owner_type, owner_id, provider, encrypted_api_key, chat_model, embed_model, updated_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (id) DO NOTHING;
        `,
        [l.id, l.ownerType, l.ownerId, l.provider, l.encryptedApiKey, l.chatModel, l.embedModel, l.updatedAt],
      );
    }
  } finally {
    client.release();
  }
}

export async function findUserByEmail(email: string) {
  const { rows } = await pool.query<User>(
    'SELECT id, email, name, role, is_active as "isActive", password FROM users WHERE email = $1',
    [email],
  );
  return rows[0];
}

export async function findUserById(id: string) {
  const { rows } = await pool.query<User>(
    'SELECT id, email, name, role, is_active as "isActive", password FROM users WHERE id = $1',
    [id],
  );
  return rows[0];
}

export async function insertUser(user: User) {
  await pool.query(
    `
      INSERT INTO users (id, email, name, role, password, is_active)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, role = EXCLUDED.role, password = EXCLUDED.password, is_active = EXCLUDED.is_active
    `,
    [user.id, user.email, user.name, user.role, user.password ?? 'demo', user.isActive ?? true],
  );
}

export async function insertProfile(profile: {
  id: string;
  displayName: string;
  baseInfo: Record<string, unknown>;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
}) {
  await pool.query(
    `
      INSERT INTO profiles (id, display_name, base_info, created_by, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      profile.id,
      profile.displayName,
      JSON.stringify(profile.baseInfo ?? {}),
      profile.createdBy ?? null,
      profile.createdAt ?? new Date().toISOString(),
      profile.updatedAt ?? new Date().toISOString(),
    ],
  );
}

export async function updateProfileRecord(profile: {
  id: string;
  displayName: string;
  baseInfo: Record<string, unknown>;
}) {
  await pool.query(
    `
      UPDATE profiles
      SET display_name = $2,
          base_info = $3,
          updated_at = NOW()
      WHERE id = $1
    `,
    [profile.id, profile.displayName, JSON.stringify(profile.baseInfo ?? {})],
  );
}

export async function insertResumeRecord(resume: Resume) {
  await pool.query(
    `
      INSERT INTO resumes (id, label, file_path, resume_text, resume_json, created_at)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (id) DO NOTHING
    `,
    [
      resume.id,
      resume.label,
      resume.filePath,
      resume.resumeText ?? null,
      JSON.stringify(resume.resumeJson ?? {}),
      resume.createdAt,
    ],
  );
}

export async function insertProfileResumeRecord(record: ProfileResume) {
  await pool.query(
    `
      INSERT INTO profile_resumes (id, profile_id, resume_id, created_at)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (id) DO NOTHING
    `,
    [record.id, record.profileId, record.resumeId, record.createdAt],
  );
}

export async function deleteProfileResume(profileId: string, resumeId: string) {
  await pool.query('DELETE FROM profile_resumes WHERE profile_id = $1 AND resume_id = $2', [
    profileId,
    resumeId,
  ]);
}

export async function deleteResumeById(resumeId: string) {
  await pool.query('DELETE FROM resumes WHERE id = $1', [resumeId]);
}

export type BidderSummary = {
  id: string;
  name: string;
  email: string;
  profiles: { id: string; displayName: string }[];
};

export async function listBidderSummaries(): Promise<BidderSummary[]> {
  const { rows } = await pool.query<BidderSummary & { profiles: any }>(`
    SELECT
      u.id,
      u.name,
      u.email,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object('id', p.id, 'displayName', p.display_name)
        ) FILTER (WHERE p.id IS NOT NULL),
        '[]'
      ) as profiles
    FROM users u
    LEFT JOIN assignments a ON a.bidder_user_id = u.id AND a.unassigned_at IS NULL
    LEFT JOIN profiles p ON p.id = a.profile_id
    WHERE u.role = 'BIDDER'
    GROUP BY u.id, u.name, u.email
    ORDER BY u.name ASC
  `);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    profiles: r.profiles ?? [],
  }));
}
