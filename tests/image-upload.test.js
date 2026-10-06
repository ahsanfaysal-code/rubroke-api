import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'node:crypto';
import app from '../src/index.js';
import prisma from '../src/lib/prisma.js';

describe('Story Image Upload & Persistence API', () => {
  const testUserEmail = `upload-test-${randomUUID()}@example.invalid`;
  const testUserPassword = randomBytes(24).toString('base64url');
  const testAdminEmail = `upload-admin-${randomUUID()}@example.invalid`;
  const testAdminPassword = randomBytes(24).toString('base64url');

  let userToken = '';
  let adminToken = '';
  const createdStoryIds = [];

  beforeAll(async () => {
    // Create test user
    await prisma.user.create({
      data: {
        name: 'Upload Tester',
        email: testUserEmail,
        password: await bcrypt.hash(testUserPassword, 10),
        role: 'user',
      },
    });

    // Create test admin
    await prisma.user.create({
      data: {
        name: 'Upload Admin',
        email: testAdminEmail,
        password: await bcrypt.hash(testAdminPassword, 10),
        role: 'admin',
      },
    });

    const userLogin = await request(app).post('/api/auth/login').send({
      email: testUserEmail,
      password: testUserPassword,
    });
    userToken = userLogin.body.token;

    const adminLogin = await request(app).post('/api/auth/login').send({
      email: testAdminEmail,
      password: testAdminPassword,
    });
    adminToken = adminLogin.body.token;
  });

  afterAll(async () => {
    for (const id of createdStoryIds) {
      await prisma.story.delete({ where: { id } }).catch(() => {});
    }
    await prisma.user.delete({ where: { email: testUserEmail } }).catch(() => {});
    await prisma.user.delete({ where: { email: testAdminEmail } }).catch(() => {});
    await prisma.$disconnect();
  });

  it('rejects unauthenticated upload to /api/stories/upload-image (401)', async () => {
    const res = await request(app)
      .post('/api/stories/upload-image')
      .attach('image', Buffer.from('fake image content'), 'test.jpg');

    expect(res.status).toBe(401);
  });

  it('rejects upload with no image file attached (400)', async () => {
    const res = await request(app)
      .post('/api/stories/upload-image')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/no image file/i);
  });

  it('rejects upload of non-image files such as PDF or TXT (400)', async () => {
    const pdfBuffer = Buffer.from('%PDF-1.4 mock content');
    const res = await request(app)
      .post('/api/stories/upload-image')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('image', pdfBuffer, { filename: 'document.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid file type/i);
  });

  it('rejects upload of files exceeding 2 MB (400)', async () => {
    const bigBuffer = Buffer.alloc(2.5 * 1024 * 1024); // 2.5 MB
    const res = await request(app)
      .post('/api/stories/upload-image')
      .set('Authorization', `Bearer ${userToken}`)
      .attach('image', bigBuffer, { filename: 'large-photo.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/2 MB or less/i);
  });

  it('validates imageUrl format during story creation and rejects invalid URL (400)', async () => {
    const res = await request(app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Story With Bad Image',
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        businessName: 'Jane Bakery',
        businessType: 'Bakery',
        businessStage: 'Early',
        imageUrl: 'not-a-valid-url',
      });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.message).toMatch(/Invalid image URL format/i);
  });

  it('accepts valid imageUrl in story creation and saves it in database', async () => {
    const mockStorageUrl = 'https://supabase.example.co/storage/v1/object/public/story-images/1/test-image.jpg';
    const res = await request(app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Coffee Cart Saved With Photo',
        fullName: 'John Brewer',
        email: 'brewer@example.com',
        country: 'USA',
        city: 'Portland',
        businessName: 'Roast & Toast',
        businessType: 'Coffee Shop',
        businessStage: 'Operational',
        problem: 'Equipment broke down',
        helpNeeded: ['Funding'],
        detailedStory: 'Need emergency repairs for espresso machine.',
        imageUrl: mockStorageUrl,
        monthlyExpenses: 2500,
        monthlyRevenue: 3000,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.id).toBeDefined();

    const storyId = res.body.id;
    createdStoryIds.push(storyId);

    // Verify GET /api/stories/:id returns imageUrl
    const detailRes = await request(app)
      .get(`/api/stories/${storyId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.imageUrl).toBe(mockStorageUrl);
    expect(detailRes.body.data.monthlyExpenses).toBe(2500);

    // Approve story via admin
    const approveRes = await request(app)
      .put(`/api/stories/${storyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'approved' });
    expect(approveRes.status).toBe(200);

    // Verify public GET /api/stories includes imageUrl in PUBLIC_STORY_SELECT
    const listRes = await request(app).get('/api/stories');
    expect(listRes.status).toBe(200);
    const found = listRes.body.data.find((s) => s.id === storyId);
    expect(found).toBeDefined();
    expect(found.imageUrl).toBe(mockStorageUrl);
  });

  it('allows stories without imageUrl and defaults to null', async () => {
    const res = await request(app)
      .post('/api/stories')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Story Without Photo',
        fullName: 'Alex Smith',
        email: 'alex@example.com',
        country: 'Canada',
        city: 'Toronto',
        businessName: 'Alex Tech',
        businessType: 'Technology',
        businessStage: 'Idea',
        problem: 'Need mentorship',
        helpNeeded: ['Mentor'],
        detailedStory: 'Building an open source tool.',
      });

    expect(res.status).toBe(201);
    const storyId = res.body.id;
    createdStoryIds.push(storyId);

    const detailRes = await request(app)
      .get(`/api/stories/${storyId}`)
      .set('Authorization', `Bearer ${userToken}`);

    expect(detailRes.status).toBe(200);
    expect(detailRes.body.data.imageUrl).toBeNull();
  });
});
