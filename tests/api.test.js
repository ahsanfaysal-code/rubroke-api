import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import app from '../src/index.js';
import prisma from '../src/lib/prisma.js';

// These tests hit the real app + dev SQLite DB. We clean up the rows we create.
const createdStoryIds = [];
const testAdminEmail = `security-test-${randomUUID()}@example.invalid`;
const testAdminPassword = randomBytes(24).toString('base64url');
const testUserEmail = `story-test-${randomUUID()}@example.invalid`;
const testUserPassword = randomBytes(24).toString('base64url');
let userToken = '';

async function cleanup() {
  for (const id of createdStoryIds) {
    // Cascades to supporters + pledges via schema onDelete: Cascade
    await prisma.story.delete({ where: { id } }).catch(() => { });
  }
  await prisma.whyBroke.deleteMany({ where: { email: 'test-suite@example.com' } }).catch(() => { });
  await prisma.user.delete({ where: { email: testAdminEmail } }).catch(() => { });
  await prisma.user.delete({ where: { email: testUserEmail } }).catch(() => { });
}

beforeAll(async () => {
  await cleanup();
  await prisma.user.create({
    data: {
      name: 'Security Test Administrator',
      email: testAdminEmail,
      password: await bcrypt.hash(testAdminPassword, 10),
      role: 'admin',
    },
  });
  // A normal (non-admin) user used to exercise authenticated story submission.
  await prisma.user.create({
    data: {
      name: 'Story Author',
      email: testUserEmail,
      password: await bcrypt.hash(testUserPassword, 10),
      role: 'user',
    },
  });
  const login = await request(app).post('/api/auth/login').send({ email: testUserEmail, password: testUserPassword });
  userToken = login.body.token;
});
afterAll(async () => { await cleanup(); await prisma.$disconnect(); });

const storyPayload = {
  title: 'Test Suite Cart',
  fullName: 'Test Runner',
  email: 'runner@example.com',
  country: 'USA',
  city: 'Testville',
  businessName: 'TestCo',
  businessType: 'Coffee Shop',
  businessStage: 'Started Recently',
  problem: 'ran out of runway',
  helpNeeded: ['Funding', 'Mentor'],
  detailedStory: 'It went sideways.',
  confirmAccurate: true,
  confirmTerms: true,
  confirmPublish: true,
  fundingNeeded: 10000,
  employees: 2,
};

describe('Health', () => {
  it('GET /api/health returns ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('Auth', () => {
  it('rejects bad credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'nope@x.com', password: 'wrong' });
    expect(res.body.success).toBe(false);
  });

  it('configured admin login yields a token', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: testAdminEmail, password: testAdminPassword });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
  });
});

describe('Stories', () => {
  it('rejects unauthenticated submission (401)', async () => {
    const res = await request(app).post('/api/stories').send(storyPayload);
    expect(res.status).toBe(401);
  });

  it('rejects submission missing required fields (400)', async () => {
    const res = await request(app).post('/api/stories').set('Authorization', `Bearer ${userToken}`).send({ fullName: 'X', email: 'x@y.com' });
    expect(res.status).toBe(400);
  });

  it('accepts an authenticated submission with title + helpNeeded', async () => {
    const res = await request(app).post('/api/stories').set('Authorization', `Bearer ${userToken}`).send(storyPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeTruthy();
    createdStoryIds.push(res.body.id);
  });

  it('new stories are pending: hidden from public (404), accessible to author (200)', async () => {
    const id = createdStoryIds[0];
    const unauthRes = await request(app).get(`/api/stories/${id}`);
    expect(unauthRes.status).toBe(404);

    const authorRes = await request(app).get(`/api/stories/${id}`).set('Authorization', `Bearer ${userToken}`);
    expect(authorRes.status).toBe(200);
    expect(authorRes.body.data.status).toBe('pending');
    expect(authorRes.body.data.title).toBe(storyPayload.title);
  });

  it('public caller cannot bypass status filter via ?status=pending', async () => {
    const list = await request(app).get('/api/stories?status=pending');
    expect(list.status).toBe(200);
    expect(list.body.data.every((s) => s.status === 'approved')).toBe(true);
  });

  it('blocks unauthenticated status update (401)', async () => {
    const id = createdStoryIds[0];
    const res = await request(app).put(`/api/stories/${id}`).send({ status: 'approved' });
    expect(res.status).toBe(401);
  });

  it('rejects google login with no credential (400)', async () => {
    const res = await request(app).post('/api/auth/google-login').send({});
    expect(res.status).toBe(400);
  });

  it('rejects google login with a bogus credential (500/401)', async () => {
    const res = await request(app).post('/api/auth/google-login').send({ credential: 'not.a.real.token' });
    expect([401, 500]).toContain(res.status);
  });

  it('admin can approve; approved story becomes public and hides PII', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: testAdminEmail, password: testAdminPassword });
    const token = login.body.token;
    const id = createdStoryIds[0];
    const upd = await request(app).put(`/api/stories/${id}`).set('Authorization', `Bearer ${token}`).send({ status: 'approved' });
    expect(upd.body.data.status).toBe('approved');

    const list = await request(app).get('/api/stories?status=approved');
    const pubStory = list.body.data.find((s) => s.id === id);
    expect(pubStory).toBeTruthy();
    expect(pubStory.email).toBeUndefined();
    expect(pubStory.phone).toBeUndefined();

    // GET /api/stories/:id for public caller must also omit PII
    const single = await request(app).get(`/api/stories/${id}`);
    expect(single.status).toBe(200);
    expect(single.body.data.email).toBeUndefined();
    expect(single.body.data.phone).toBeUndefined();
    expect(single.body.data.confirmAccurate).toBeUndefined();
  });

  it('admin update ignores unauthorized mass-assignment fields (id, authorId)', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: testAdminEmail, password: testAdminPassword });
    const token = login.body.token;
    const id = createdStoryIds[0];
    const res = await request(app)
      .put(`/api/stories/${id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 99999, authorId: 88888, title: 'Updated Safe Title' });
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.authorId).not.toBe(88888);
    expect(res.body.data.title).toBe('Updated Safe Title');
  });
});

describe('Supporters (comments)', () => {
  it('rejects empty supporter (400)', async () => {
    const id = createdStoryIds[0];
    const res = await request(app).post(`/api/stories/${id}/supporters`).send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('adds a supporter and lists it', async () => {
    const id = createdStoryIds[0];
    const add = await request(app).post(`/api/stories/${id}/supporters`).send({ name: 'Ally', message: 'You got this!' });
    expect(add.status).toBe(201);
    const supId = add.body.data.id;

    const list = await request(app).get(`/api/stories/${id}/supporters`);
    expect(list.body.data.some(s => s.id === supId)).toBe(true);

    const up = await request(app).post(`/api/stories/${id}/supporters/${supId}/upvote`);
    expect(up.body.data.upvotes).toBe(1);
  });
});

describe('Pledges (funding, demo mode)', () => {
  it('rejects invalid amount (400)', async () => {
    const id = createdStoryIds[0];
    const res = await request(app).post(`/api/stories/${id}/pledges`).send({ name: 'A', email: 'a@b.com', amount: 0 });
    expect(res.status).toBe(400);
  });

  it('records a pledge and increases fundingRaised', async () => {
    const id = createdStoryIds[0];
    const res = await request(app).post(`/api/stories/${id}/pledges`).send({ name: 'Backer', email: 'b@b.com', amount: 500 });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.fundingRaised).toBe(500);

    const story = await request(app).get(`/api/stories/${id}`);
    expect(story.body.data.fundingRaised).toBe(500);

    const backers = await request(app).get(`/api/stories/${id}/pledges`);
    expect(backers.body.data.length).toBe(1);
  });
});

describe('Why-Broke', () => {
  it('rejects missing fields (400)', async () => {
    const res = await request(app).post('/api/why-broke').send({ name: 'X' });
    expect(res.status).toBe(400);
  });

  it('accepts a valid reality check', async () => {
    const res = await request(app).post('/api/why-broke').send({
      name: 'Tester', email: 'test-suite@example.com', businessType: 'Agency',
      businessDuration: '< 1 Year', problem: 'no clients', whyBroke: 'ads failed', needs: 'Mentorship',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });
});

describe('Admin (support + funding)', () => {
  async function adminToken() {
    const login = await request(app).post('/api/auth/login').send({ email: testAdminEmail, password: testAdminPassword });
    return login.body.token;
  }

  it('blocks admin supporters list without token (401)', async () => {
    const res = await request(app).get('/api/admin/supporters');
    expect(res.status).toBe(401);
  });

  it('admin can list supporters and pledges', async () => {
    const token = await adminToken();

    // seed a supporter + pledge on the test story
    const id = createdStoryIds[0];
    await request(app).post(`/api/stories/${id}/supporters`).send({ name: 'Ally', message: 'Go!' });
    await request(app).post(`/api/stories/${id}/pledges`).send({ name: 'Backer', email: 'b@b.com', amount: 250 });

    const sup = await request(app).get('/api/admin/supporters').set('Authorization', `Bearer ${token}`);
    expect(sup.status).toBe(200);
    expect(sup.body.data.length).toBeGreaterThan(0);
    expect(sup.body.data[0].story).toBeTruthy();

    const pl = await request(app).get('/api/admin/pledges').set('Authorization', `Bearer ${token}`);
    expect(pl.status).toBe(200);
    expect(pl.body.data.length).toBeGreaterThan(0);
    // The pledge we just seeded must appear and be counted toward the total raised.
    const seeded = pl.body.data.find((p) => p.email === 'b@b.com' && p.amount === 250);
    expect(seeded).toBeTruthy();
    expect(pl.body.totalRaised).toBeGreaterThanOrEqual(250);
  });
});

describe('Stripe webhook (unconfigured)', () => {
  it('returns 503 when webhook is not configured', async () => {
    const res = await request(app).post('/api/stripe/webhook').set('stripe-signature', 'x').send('{}');
    expect(res.status).toBe(503);
  });
});

describe('Pledge confirmation', () => {
  it('does not expose a public confirmation route', async () => {
    const id = createdStoryIds[0];
    const res = await request(app).post(`/api/stories/${id}/pledges/1/confirm`).send({});
    expect(res.status).toBe(404);
  });
});

describe('Rate Limiter Cache-Busting Protection', () => {
  it('aggregates hits by path and cannot be bypassed via query strings', () => {
    const { createRateLimiter } = require('../src/middleware/rateLimit');
    const limiter = createRateLimiter({ windowMs: 60000, max: 2 });
    let blocked = false;
    const req1 = { ip: '1.2.3.4', originalUrl: '/api/test?v=1' };
    const req2 = { ip: '1.2.3.4', originalUrl: '/api/test?v=2' };
    const req3 = { ip: '1.2.3.4', originalUrl: '/api/test?v=3' };
    const res = {
      set: () => { },
      status: (code) => ({
        json: () => {
          if (code === 429) blocked = true;
        },
      }),
    };
    limiter(req1, res, () => { });
    limiter(req2, res, () => { });
    limiter(req3, res, () => { });
    expect(blocked).toBe(true);
  });
});
