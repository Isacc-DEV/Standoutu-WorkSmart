"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.llmSettings = exports.events = exports.sessions = exports.assignments = exports.resumes = exports.profiles = exports.users = exports.PROFILE_ID = exports.BIDDER_ID = exports.MANAGER_ID = exports.ADMIN_ID = void 0;
exports.ADMIN_ID = '00000000-0000-0000-0000-000000000001';
exports.MANAGER_ID = '00000000-0000-0000-0000-000000000002';
exports.BIDDER_ID = '00000000-0000-0000-0000-000000000003';
exports.PROFILE_ID = '00000000-0000-0000-0000-000000000010';
// Seed demo users (also inserted into DB on startup)
exports.users = [
    {
        id: exports.ADMIN_ID,
        email: 'admin@smartwork.local',
        role: 'ADMIN',
        name: 'Admin User',
        isActive: true,
        password: 'demo',
    },
    {
        id: exports.MANAGER_ID,
        email: 'manager@smartwork.local',
        role: 'MANAGER',
        name: 'Manager Mary',
        isActive: true,
        password: 'demo',
    },
    {
        id: exports.BIDDER_ID,
        email: 'bidder@smartwork.local',
        role: 'BIDDER',
        name: 'Bidder Bob',
        isActive: true,
        password: 'demo',
    },
];
exports.profiles = [
    {
        id: exports.PROFILE_ID,
        displayName: 'Amin Khan',
        baseInfo: {
            name: { first: 'Amin', last: 'Khan' },
            contact: { email: 'amin@email.com', phone: '+1-555-1000' },
            links: { linkedin: 'https://linkedin.com/in/amink', github: 'https://github.com/amink' },
            location: { city: 'Toronto', country: 'Canada' },
            workAuth: { authorized: true, needsSponsorship: false },
            defaultAnswers: { notice_period: '2 weeks', start_date: 'Immediately' },
        },
        createdBy: exports.MANAGER_ID,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    },
];
exports.resumes = [
    {
        id: '00000000-0000-0000-0000-000000000101',
        profileId: exports.PROFILE_ID,
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
        profileId: exports.PROFILE_ID,
        label: 'Frontend',
        filePath: '/data/resumes/demo/frontend.pdf',
        resumeText: 'Frontend-focused engineer with React and Next.js experience.',
        resumeJson: {
            skills: ['React', 'Next.js', 'TypeScript', 'UI/UX'],
            experience: [{ company: 'Globex', title: 'Frontend Engineer', years: 4 }],
        },
        createdAt: new Date().toISOString(),
    },
];
exports.assignments = [
    {
        id: '00000000-0000-0000-0000-000000000201',
        profileId: exports.PROFILE_ID,
        bidderUserId: exports.BIDDER_ID,
        assignedBy: exports.MANAGER_ID,
        assignedAt: new Date().toISOString(),
        unassignedAt: null,
    },
];
exports.sessions = [];
exports.events = [];
exports.llmSettings = [
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
