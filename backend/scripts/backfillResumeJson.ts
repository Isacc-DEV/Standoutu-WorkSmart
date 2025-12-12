// @ts-nocheck
import 'ts-node/register/transpile-only';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs/promises';
import fsSync from 'fs';
import pdfParse from 'pdf-parse';
import { extractRawText } from 'mammoth';
import { buildResumeParsePrompt } from '../src/promptPack';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const PROJECT_ROOT = path.join(__dirname, '..');
const RESUME_DIR = process.env.RESUME_DIR ?? path.join(PROJECT_ROOT, 'data', 'resumes');
const HF_TOKEN = process.env.HF_TOKEN || process.env.HUGGINGFACEHUB_API_TOKEN;
const HF_MODEL = 'mistralai/Mistral-7B-Instruct-v0.3';

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
    if (byte < 9 || (byte > 13 && byte < 32) || byte > 126) {
      nonText += 1;
    }
  }
  return nonText / sample.length > 0.3;
}

function resolveResumePath(p: string) {
  if (!p) return '';
  if (path.isAbsolute(p)) return p;
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

async function extractResumeTextFromFile(filePath: string, fileName?: string) {
  try {
    const ext = (fileName ?? path.extname(filePath)).toLowerCase();
    const buf = await fs.readFile(filePath);

    if (buf.subarray(0, 4).toString() === '%PDF') {
      try {
        const parsed = await pdfParse(buf);
        if (parsed.text?.trim()) return sanitizeText(parsed.text);
      } catch {
        // ignore
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
    if (looksBinary(buf)) return '';
    return sanitizeText(buf.toString('utf8'));
  } catch (err) {
    console.error('extractResumeTextFromFile failed', err);
    return '';
  }
}

async function tryParseResumeText(resumeId: string, resumeText: string) {
  if (!resumeText?.trim()) return undefined;
  const prompt = buildResumeParsePrompt({
    resumeId,
    resumeText,
    baseProfile: {},
  });
  if (!HF_TOKEN) {
    console.warn('HF token missing; skip parse for', resumeId);
    return undefined;
  }
  try {
    const res = await fetch(`https://api-inference.huggingface.co/models/${HF_MODEL}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${HF_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          max_new_tokens: 1024,
          temperature: 0.1,
          repetition_penalty: 1.05,
          return_full_text: false,
        },
      }),
    });
    const data = (await res.json()) as { generated_text?: string }[] | { error?: string };
    const raw = Array.isArray(data) ? data[0]?.generated_text : undefined;
    if (!raw) return undefined;
    try {
      const parsed = JSON.parse(raw);
      return parsed?.result ?? parsed ?? undefined;
    } catch {
      return undefined;
    }
  } catch (err) {
    console.error('call HF failed', err);
    return undefined;
  }
}

async function run() {
  const client = await pool.connect();
  try {
    const { rows } = await client.query(
      'SELECT id, file_path as "filePath", resume_text as "resumeText", resume_json as "resumeJson" FROM resumes',
    );
    console.log(`Found ${rows.length} resumes`);
    for (const row of rows) {
      let text = row.resumeText as string | null;
      if (!text && row.filePath) {
        const resolved = resolveResumePath(row.filePath);
        if (resolved && fsSync.existsSync(resolved)) {
          text = await extractResumeTextFromFile(resolved, path.basename(resolved));
        }
      } else {
        text = sanitizeText(text ?? '');
      }

      let json = row.resumeJson as any;
      if (!json) {
        json = await tryParseResumeText(row.id, text ?? '');
      }

      await client.query(
        'UPDATE resumes SET resume_text = $2, resume_json = $3 WHERE id = $1',
        [row.id, text || null, json || null],
      );
      console.log(`Updated resume ${row.id} | text length=${text?.length ?? 0} | json=${json ? 'yes' : 'no'}`);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
