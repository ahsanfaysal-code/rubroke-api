import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import app from '../src/index.js';
import prisma from '../src/lib/prisma.js';

// These tests hit the real app + dev SQLite DB. We clean up the rows we create.
const createdStoryIds = [];

async function cleanup() {
  for (const id of createdStoryIds) {
    // Cascades to supporters + pledges via schema onDelete: Cascade
    await prisma.story.delete({ where: { id } }).catch(() => {});
  }
  await prisma.whyBroke.deleteMany({ where: { email: 'test-suite@example.com' } }).catch(() => {});
}

beforeAll(async () => { await cleanup(); });
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

  it('admin login yields a token', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'admin@rubroke.com', password: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeTruthy();
    expect(res.body.user.role).toBe('admin');
  });
});

describe('Stories', () => {
  it('rejects submission missing required fields (400)', async () => {
    const res = await request(app).post('/api/stories').send({ fullName: 'X', email: 'x@y.com' });
    expect(res.status).toBe(400);
  });

  it('accepts a public submission with title + helpNeeded', async () => {
    const res = await request(app).post('/api/stories').send(storyPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeTruthy();
    createdStoryIds.push(res.body.id);
  });

  it('new stories are pending (hidden from public approved list)', async () => {
    const id = createdStoryIds[0];
    const res = await request(app).get(`/api/stories/${id}`);
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.title).toBe(storyPayload.title);
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

  it('admin can approve; approved story becomes public', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@rubroke.com', password: 'admin' });
    const token = login.body.token;
    const id = createdStoryIds[0];
    const upd = await request(app).put(`/api/stories/${id}`).set('Authorization', `Bearer ${token}`).send({ status: 'approved' });
    expect(upd.body.data.status).toBe('approved');

    const list = await request(app).get('/api/stories?status=approved');
    expect(list.body.data.some(s => s.id === id)).toBe(true);
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
    const login = await request(app).post('/api/auth/login').send({ email: 'admin@rubroke.com', password: 'admin' });
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

