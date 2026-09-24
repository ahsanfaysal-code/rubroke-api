const express = require('express');
const prisma = require('../lib/prisma');
const { authenticateToken } = require('../middleware/auth');

// These are the calculator registry slugs that can be saved. Keeping a server-side
// allow-list means arbitrary values cannot be persisted as calculator types.
const VALID_CALCULATOR_TYPES = new Set([
  'budget', 'savings', 'emergency', 'networth', '503020',
  'compound', 'roi', 'investment', 'fire', 'rule72',
  'loan', 'emi', 'debt', 'creditcard', 'mortgage',
  'profit', 'breakeven', 'grossmargin', 'profitmargin', 'runway',
  'salary', 'overtime', 'hourly', 'tax', 'freelance',
  'retirement', 'inflation', 'college', 'passive', 'financialfreedom',
  'goal', 'downpayment', 'vacation', 'car', 'wedding',
  'date', 'percentage', 'tip', 'unit', 'compounddaily',
]);

const MAX_NAME_LENGTH = 120;
const MAX_DATA_BYTES = 50_000;

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function serializeCalculationData(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  try {
    const serialized = JSON.stringify(value);
    if (!serialized || Buffer.byteLength(serialized, 'utf8') > MAX_DATA_BYTES) return null;
    return serialized;
  } catch {
    return null;
  }
}

function toCalculationResponse(calculation) {
  let inputData;
  let resultData;

  try {
    inputData = JSON.parse(calculation.inputData);
    resultData = JSON.parse(calculation.resultData);
  } catch {
    // A malformed legacy row should not take down the user's whole saved page.
    inputData = {};
    resultData = {};
  }

  return {
    id: calculation.id,
    name: calculation.name,
    calculatorType: calculation.calculatorType,
    inputData,
    resultData,
    createdAt: calculation.createdAt,
    updatedAt: calculation.updatedAt,
  };
}

function createCalculationsRouter(database = prisma) {
  const router = express.Router();

  router.use(authenticateToken);

  // POST /api/calculations
  router.post('/', async (req, res) => {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
    const calculatorType = typeof req.body?.calculatorType === 'string' ? req.body.calculatorType : '';
    const inputData = serializeCalculationData(req.body?.inputData);
    const resultData = serializeCalculationData(req.body?.resultData);

    if (!name || name.length > MAX_NAME_LENGTH) {
      return res.status(400).json({ success: false, message: `Name is required and must be ${MAX_NAME_LENGTH} characters or fewer.` });
    }
    if (!VALID_CALCULATOR_TYPES.has(calculatorType)) {
      return res.status(400).json({ success: false, message: 'Invalid calculator type.' });
    }
    if (!inputData || !resultData) {
      return res.status(400).json({ success: false, message: 'Calculation inputs and results must be valid, reasonably sized objects.' });
    }

    try {
      const calculation = await database.savedCalculation.create({
        data: {
          // Ownership is derived only from the verified JWT, never a request field.
          userId: req.user.id,
          name,
          calculatorType,
          inputData,
          resultData,
        },
      });
      return res.status(201).json({ success: true, data: toCalculationResponse(calculation) });
    } catch (error) {
      console.error('Error saving calculation:', error);
      return res.status(500).json({ success: false, message: 'Unable to save calculation.' });
    }
  });

  // GET /api/calculations
  router.get('/', async (req, res) => {
    try {
      const calculations = await database.savedCalculation.findMany({
        where: { userId: req.user.id },
        orderBy: { createdAt: 'desc' },
      });
      return res.json({ success: true, data: calculations.map(toCalculationResponse) });
    } catch (error) {
      console.error('Error listing saved calculations:', error);
      return res.status(500).json({ success: false, message: 'Unable to load saved calculations.' });
    }
  });

  // GET /api/calculations/:id
  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid calculation id.' });

    try {
      // Include userId in the lookup so another user's record is indistinguishable from absent.
      const calculation = await database.savedCalculation.findFirst({ where: { id, userId: req.user.id } });
      if (!calculation) return res.status(404).json({ success: false, message: 'Saved calculation not found.' });
      return res.json({ success: true, data: toCalculationResponse(calculation) });
    } catch (error) {
      console.error('Error loading saved calculation:', error);
      return res.status(500).json({ success: false, message: 'Unable to load saved calculation.' });
    }
  });

  // DELETE /api/calculations/:id
  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ success: false, message: 'Invalid calculation id.' });

    try {
      // deleteMany with both predicates prevents an IDOR race or an ownership bypass.
      const result = await database.savedCalculation.deleteMany({ where: { id, userId: req.user.id } });
      if (result.count === 0) return res.status(404).json({ success: false, message: 'Saved calculation not found.' });
      return res.status(204).send();
    } catch (error) {
      console.error('Error deleting saved calculation:', error);
      return res.status(500).json({ success: false, message: 'Unable to delete saved calculation.' });
    }
  });

  return router;
}

const router = createCalculationsRouter();

module.exports = router;
module.exports.createCalculationsRouter = createCalculationsRouter;
module.exports.VALID_CALCULATOR_TYPES = VALID_CALCULATOR_TYPES;
