const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// POST /api/why-broke  (public "Reality Check" lead capture from the modal)
router.post('/', async (req, res) => {
  try {
    const {
      name,
      email,
      whatsapp,
      businessType,
      businessDuration,
      location,
      problem,
      whyBroke,
      needs,
    } = req.body;

    if (!name || !email || !whyBroke || !needs) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const lead = await prisma.whyBroke.create({
      data: {
        name,
        email,
        whatsapp: whatsapp || null,
        businessType: businessType || '',
        businessDuration: businessDuration || '',
        location: location || null,
        problem: problem || '',
        whyBroke,
        needs,
      },
    });

    res.status(201).json({ success: true, id: lead.id, message: 'Reality check received.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
