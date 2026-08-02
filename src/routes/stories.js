const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const supportersRoutes = require('./supporters');
const pledgesRoutes = require('./pledges');

// Nested sub-resources (public community support + funding)
router.use('/:storyId/supporters', supportersRoutes);
router.use('/:storyId/pledges', pledgesRoutes);

// GET /api/stories
router.get('/', async (req, res) => {
  try {
    const { status, search, businessType, businessStage, limit = 12, page = 1 } = req.query;
    
    let where = {};
    if (status && status !== 'all') {
      where.status = status;
    } else if (!status) {
      where.status = 'approved';
    }

    if (businessType) where.businessType = businessType;
    if (businessStage) where.businessStage = businessStage;
    
    if (search) {
      where.OR = [
        { businessName: { contains: search } },
        { problem: { contains: search } },
        { detailedStory: { contains: search } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const take = parseInt(limit);

    const [stories, total] = await Promise.all([
      prisma.story.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' }
      }),
      prisma.story.count({ where })
    ]);

    res.json({
      success: true,
      data: stories,
      meta: {
        total,
        page: parseInt(page),
        totalPages: Math.ceil(total / take)
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// GET /api/stories/:id
router.get('/:id', async (req, res) => {
  try {
    const story = await prisma.story.findUnique({
      where: { id: parseInt(req.params.id) },
      include: {
        supporters: { orderBy: { createdAt: 'desc' } },
      },
    });
    
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });
    
    res.json({ success: true, data: story });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/stories (public submission from the "Share Your Story" wizard)
router.post('/', async (req, res) => {
  try {
    const {
      title,
      fullName,
      email,
      country,
      city,
      phone,
      linkedin,
      businessName,
      businessType,
      businessStage,
      website,
      problem,
      helpNeeded,
      detailedStory,
      confirmAccurate,
      confirmTerms,
      confirmPublish,
      fundingNeeded,
      employees,
    } = req.body;

    if (!title || !businessName || !email || !fullName) {
      return res.status(400).json({ success: false, message: 'Title, business name, full name and email are required.' });
    }

    const story = await prisma.story.create({
      data: {
        title,
        fullName,
        email,
        country: country || '',
        city: city || '',
        phone: phone || null,
        linkedin: linkedin || null,
        businessName,
        businessType,
        businessStage,
        website: website || null,
        problem: problem || '',
        // helpNeeded may arrive as an array or a JSON string
        helpNeeded: Array.isArray(helpNeeded) ? JSON.stringify(helpNeeded) : (helpNeeded || '[]'),
        detailedStory: detailedStory || '',
        status: 'pending',
        confirmAccurate: confirmAccurate === true || confirmAccurate === 'true',
        confirmTerms: confirmTerms === true || confirmTerms === 'true',
        confirmPublish: confirmPublish === true || confirmPublish === 'true',
        fundingNeeded: parseFloat(fundingNeeded) || 0,
        employees: parseInt(employees) || 1
      }
    });
    res.status(201).json({ success: true, id: story.id, message: 'Story submitted successfully' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error saving story' });
  }
});

// PUT /api/stories/:id (Admin only)
router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const story = await prisma.story.update({
      where: { id: parseInt(req.params.id) },
      data: req.body
    });
    res.json({ success: true, data: story });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error updating story' });
  }
});

// DELETE /api/stories/:id (Admin only)
router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await prisma.story.delete({
      where: { id: parseInt(req.params.id) }
    });
    res.json({ success: true, message: 'Story deleted' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error deleting story' });
  }
});

module.exports = router;
