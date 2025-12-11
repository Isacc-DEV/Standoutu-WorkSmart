import { ApplicationEvent, ApplicationSession, Assignment, LlmSettings, Profile, Resume, User } from './types';
import { ProfileResume } from './types';

export const ADMIN_ID = '00000000-0000-0000-0000-000000000001';
export const MANAGER_ID = '00000000-0000-0000-0000-000000000002';
export const BIDDER_ID = '00000000-0000-0000-0000-000000000003';
export const PROFILE_ID = '00000000-0000-0000-0000-000000000010';
export const PROFILE_ID_2 = '00000000-0000-0000-0000-000000000011';

// Seed demo users (also inserted into DB on startup)
export const users: User[] = [
  {
    id: ADMIN_ID,
    email: 'admin@smartwork.local',
    role: 'ADMIN',
    name: 'Admin User',
    isActive: true,
    password: 'demo',
  },
  {
    id: MANAGER_ID,
    email: 'manager@smartwork.local',
    role: 'MANAGER',
    name: 'Manager Mary',
    isActive: true,
    password: 'demo',
  },
  {
    id: BIDDER_ID,
    email: 'bidder@smartwork.local',
    role: 'BIDDER',
    name: 'Bidder Bob',
    isActive: true,
    password: 'demo',
  },
];

export const profiles: Profile[] = [
  {
    id: PROFILE_ID,
    displayName: 'Amin Khan',
    baseInfo: {
      name: { first: 'Amin', last: 'Khan' },
      contact: { email: 'amin@email.com', phone: '+1-555-1000' },
      links: { linkedin: 'https://linkedin.com/in/amink', github: 'https://github.com/amink' },
      location: { city: 'Toronto', country: 'Canada' },
      workAuth: { authorized: true, needsSponsorship: false },
      defaultAnswers: { notice_period: '2 weeks', start_date: 'Immediately' },
    },
    createdBy: MANAGER_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: PROFILE_ID_2,
    displayName: 'Jordan Lee',
    baseInfo: {
      name: { first: 'Jordan', last: 'Lee' },
      contact: { email: 'jordan@email.com', phone: '+1-555-2222' },
      links: { portfolio: 'https://portfolio.jordanlee.dev' },
      location: { city: 'Austin', country: 'USA' },
      workAuth: { authorized: true, needsSponsorship: false },
      defaultAnswers: { notice_period: 'Immediate', start_date: '2 weeks' },
    },
    createdBy: MANAGER_ID,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

export const resumes: Resume[] = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    label: 'Backend',
    filePath: '/data/resumes/demo/backend.pdf',
    resumeText: 'Experienced backend engineer with Node.js and PostgreSQL.',
    resumeJson: {
      skills: ['Node.js', 'PostgreSQL', 'TypeScript', 'Playwright'],
      experience: [
        { company: 'Acme', title: 'Backend Engineer', years: 3 },
        { company: 'Contoso', title: 'SWE', years: 2 },
      ],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    label: 'Frontend',
    filePath: '/data/resumes/demo/frontend.pdf',
    resumeText: 'Frontend-focused engineer with React and Next.js experience.',
    resumeJson: {
      skills: ['React', 'Next.js', 'TypeScript', 'UI/UX'],
      experience: [{ company: 'Globex', title: 'Frontend Engineer', years: 4 }],
    },
    createdAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000103',
    profileId: PROFILE_ID_2,
    label: 'Full-stack',
    filePath: '/data/resumes/demo/fullstack.pdf',
    resumeText: 'Full-stack engineer with React, Node.js, and cloud deployment experience.',
    resumeJson: {
      skills: ['React', 'Node.js', 'TypeScript', 'AWS', 'PostgreSQL'],
      experience: [
        { company: 'Skyline', title: 'Full-stack Engineer', years: 3 },
        { company: 'Northwind', title: 'Software Engineer', years: 2 },
      ],
    },
    createdAt: new Date().toISOString(),
  },
];

export const assignments: Assignment[] = [
  {
    id: '00000000-0000-0000-0000-000000000201',
    profileId: PROFILE_ID,
    bidderUserId: BIDDER_ID,
    assignedBy: MANAGER_ID,
    assignedAt: new Date().toISOString(),
    unassignedAt: null,
  },
];

export const profileResumes: ProfileResume[] = [
  {
    id: '00000000-0000-0000-0000-000000000401',
    profileId: PROFILE_ID,
    resumeId: '00000000-0000-0000-0000-000000000101',
    createdAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000402',
    profileId: PROFILE_ID,
    resumeId: '00000000-0000-0000-0000-000000000102',
    createdAt: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000403',
    profileId: PROFILE_ID_2,
    resumeId: '00000000-0000-0000-0000-000000000103',
    createdAt: new Date().toISOString(),
  },
];

export const sessions: ApplicationSession[] = [];
export const events: ApplicationEvent[] = [];
export const llmSettings: LlmSettings[] = [
  {
    id: '00000000-0000-0000-0000-000000000301',
    ownerType: 'ORG',
    ownerId: 'ORG_DEFAULT',
    provider: 'OPENAI',
    encryptedApiKey: 'REPLACE_WITH_ENCRYPTED_KEY',
    chatModel: 'gpt-4o-mini',
    embedModel: 'text-embedding-3-small',
    updatedAt: new Date().toISOString(),
  },
];
