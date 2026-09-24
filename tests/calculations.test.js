import 'dotenv/config';
import { beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import calculationsRoutes from '../src/routes/calculations.js';

const { createCalculationsRouter } = calculationsRoutes;
const userA = { id: 101, email: 'calculation-a@example.invalid', name: 'Calculation A', role: 'user' };
const userB = { id: 202, email: 'calculation-b@example.invalid', name: 'Calculation B', role: 'user' };

let rows;
let nextId;

const database = {
  savedCalculation: {
    async create({ data }) {
      const row = {
        id: nextId++,
        ...data,
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      };
      rows.push(row);
      return row;
    },
    async findMany({ where }) {
      return rows.filter((row) => row.userId === where.userId).sort((a, b) => b.createdAt - a.createdAt);
    },
    async findFirst({ where }) {
      return rows.find((row) => row.id === where.id && row.userId === where.userId) || null;
    },
    async deleteMany({ where }) {
      const originalLength = rows.length;
      rows = rows.filter((row) => row.id !== where.id || row.userId !== where.userId);
      return { count: originalLength - rows.length };
    },
  },
};

function tokenFor(user) {
  return jwt.sign(user, process.env.JWT_SECRET, { expiresIn: '5m' });
}

function validPayload(overrides = {}) {
  return {
    name: 'September budget',
    calculatorType: 'budget',
    inputData: { income: 5000, rent: 1800 },
    resultData: { Remaining: { value: '$2,000.00', tone: 'green' } },
    ...overrides,
  };
}

const app = express();
app.use(express.json());
app.use('/api/calculations', createCalculationsRouter(database));

beforeEach(() => {
  rows = [];
  nextId = 1;
});

describe('Saved calculations API', () => {
  it('rejects unauthenticated requests on every endpoint', async () => {
    expect((await request(app).get('/api/calculations')).status).toBe(401);
    expect((await request(app).post('/api/calculations').send(validPayload())).status).toBe(401);
    expect((await request(app).get('/api/calculations/1')).status).toBe(401);
    expect((await request(app).delete('/api/calculations/1')).status).toBe(401);
  });

  it('creates and lists only records belonging to the verified JWT user', async () => {
    const created = await request(app)
      .post('/api/calculations')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)
      // userId is deliberately sent as another user; the route must disregard it.
      .send(validPayload({ userId: userB.id }));

    expect(created.status).toBe(201);
    expect(created.body.data.name).toBe('September budget');
    expect(rows[0].userId).toBe(userA.id);

    const aList = await request(app).get('/api/calculations').set('Authorization', `Bearer ${tokenFor(userA)}`);
    const bList = await request(app).get('/api/calculations').set('Authorization', `Bearer ${tokenFor(userB)}`);
    expect(aList.body.data).toHaveLength(1);
    expect(bList.body.data).toEqual([]);
  });

  it('does not allow another user to read or delete a saved calculation', async () => {
    const created = await request(app)
      .post('/api/calculations')
      .set('Authorization', `Bearer ${tokenFor(userA)}`)
      .send(validPayload());
    const id = created.body.data.id;

    const readAsB = await request(app).get(`/api/calculations/${id}`).set('Authorization', `Bearer ${tokenFor(userB)}`);
    const deleteAsB = await request(app).delete(`/api/calculations/${id}`).set('Authorization', `Bearer ${tokenFor(userB)}`);
    const readAsA = await request(app).get(`/api/calculations/${id}`).set('Authorization', `Bearer ${tokenFor(userA)}`);

    expect(readAsB.status).toBe(404);
    expect(deleteAsB.status).toBe(404);
    expect(readAsA.status).toBe(200);
    expect(readAsA.body.data.id).toBe(id);
  });

  it('validates required data and calculator type', async () => {
    const token = `Bearer ${tokenFor(userA)}`;
    expect((await request(app).post('/api/calculations').set('Authorization', token).send(validPayload({ name: '   ' }))).status).toBe(400);
    expect((await request(app).post('/api/calculations').set('Authorization', token).send(validPayload({ calculatorType: 'not-a-calculator' }))).status).toBe(400);
    expect((await request(app).post('/api/calculations').set('Authorization', token).send(validPayload({ inputData: [] }))).status).toBe(400);
  });
});
