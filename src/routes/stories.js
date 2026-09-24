const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin, optionalAuth } = require('../middleware/auth');
const { createRateLimiter } = require('../middleware/rateLimit');
const supportersRoutes = require('./supporters');
const pledgesRoutes = require('./pledges');

// Public projection of a Story: excludes private founder PII (email, phone) and internal flags.
const PUBLIC_STORY_SELECT = {
  id: true,
  title: true,
  fullName: true,
  country: true,
  city: true,
  businessName: true,
  businessType: true,
  businessStage: true,
  website: true,
  problem: true,
  helpNeeded: true,
  detailedStory: true,
  status: true,
  trustScore: true,
  fundingNeeded: true,
  fundingRaised: true,
  employees: true,
  monthlyRevenue: true,
  monthlyExpenses: true,
  monthlyProfit: true,
  yearsActive: true,
  createdAt: true,
  authorId: true,
};

// Explicit whitelist of fields an administrator is permitted to modify on a Story.
const ALLOWED_ADMIN_UPDATE_FIELDS = new Set([
  'title',
  'fullName',
  'country',
  'city',
  'businessName',
  'businessType',
  'businessStage',
  'website',
  'problem',
  'helpNeeded',
  'detailedStory',
  'status',
  'trustScore',
  'fundingNeeded',
  'fundingRaised',
  'employees',
  'monthlyRevenue',
  'monthlyExpenses',
  'monthlyProfit',
  'yearsActive',
]);

// Story creation is authenticated; throttle it to blunt automated spam submissions.
// 5 per 15 minutes per IP is enough for genuine users (who must also be logged in).
const storyCreateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 5,
  message: 'You are submitting stories too quickly. Please wait a few minutes.',
});

// Nested sub-resources (public community support + funding)
router.use('/:storyId/supporters', supportersRoutes);
router.use('/:storyId/pledges', pledgesRoutes);

// GET /api/stories
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { status, search, businessType, businessStage, limit = 12, page = 1 } = req.query;
    
    let where = {};
    const isAdmin = req.user && req.user.role === 'admin';

    // Status access control: non-admins are restricted strictly to approved stories
    if (isAdmin) {
      if (status && status !== 'all') {
        where.status = status;
      } else if (!status) {
        where.status = 'approved';
      }
    } else {
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
        orderBy: { createdAt: 'desc' },
        select: isAdmin ? undefined : PUBLIC_STORY_SELECT,
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
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const storyId = parseInt(req.params.id);
    if (isNaN(storyId)) {
      return res.status(400).json({ success: false, message: 'Invalid story ID' });
    }

    const story = await prisma.story.findUnique({
      where: { id: storyId },
      include: {
        supporters: { orderBy: { createdAt: 'desc' } },
      },
    });
    
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const isAdmin = req.user && req.user.role === 'admin';
    const isAuthor = req.user && story.authorId && req.user.id === story.authorId;

    // Status access control: non-approved stories are accessible ONLY by admin or original author
    if (story.status !== 'approved' && !isAdmin && !isAuthor) {
      return res.status(404).json({ success: false, message: 'Story not found' });
    }

    // Public story PII protection: strip private contact and internal flags for general visitors
    if (!isAdmin && !isAuthor) {
      delete story.email;
      delete story.phone;
      delete story.confirmAccurate;
      delete story.confirmTerms;
      delete story.confirmPublish;
    }
    
    res.json({ success: true, data: story });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/stories (authenticated submission from the "Share Your Story" wizard)
router.post('/', authenticateToken, storyCreateLimiter, async (req, res) => {
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
      monthlyRevenue,
      monthlyExpenses,
      monthlyProfit,
      yearsActive,
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
        employees: parseInt(employees) || 1,
        monthlyRevenue: parseFloat(monthlyRevenue) || 0,
        monthlyProfit: parseFloat(monthlyProfit) || 0,
        yearsActive: yearsActive ? String(yearsActive).trim() : '0',
        // Ownership: always derived from the verified token, never the request body.
        authorId: req.user?.id ?? null,
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
    const storyId = parseInt(req.params.id);
    if (isNaN(storyId)) {
      return res.status(400).json({ success: false, message: 'Invalid story ID' });
    }

    // Explicit whitelist of allowed fields to prevent mass-assignment
    const updateData = {};
    for (const [key, value] of Object.entries(req.body || {})) {
      if (ALLOWED_ADMIN_UPDATE_FIELDS.has(key)) {
        if (key === 'helpNeeded' && Array.isArray(value)) {
          updateData[key] = JSON.stringify(value);
        } else {
          updateData[key] = value;
        }
      }
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: 'No valid update fields provided' });
    }

    const story = await prisma.story.update({
      where: { id: storyId },
      data: updateData,
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
