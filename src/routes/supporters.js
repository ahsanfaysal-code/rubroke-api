const express = require('express');
const router = express.Router({ mergeParams: true });
const prisma = require('../lib/prisma');

// GET /api/stories/:storyId/supporters  (public: list community support for a story)
router.get('/', async (req, res) => {
  try {
    const storyId = parseInt(req.params.storyId);
    const supporters = await prisma.supporter.findMany({
      where: { storyId },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, data: supporters });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/stories/:storyId/supporters  (public: leave a supportive comment)
router.post('/', async (req, res) => {
  try {
    const storyId = parseInt(req.params.storyId);
    const { name, role, message } = req.body;

    if (!name || !message) {
      return res.status(400).json({ success: false, message: 'Name and message are required.' });
    }

    const story = await prisma.story.findUnique({ where: { id: storyId } });
    if (!story) return res.status(404).json({ success: false, message: 'Story not found' });

    const supporter = await prisma.supporter.create({
      data: {
        storyId,
        name,
        role: role || 'Supporter',
        message,
      },
    });
    res.status(201).json({ success: true, data: supporter });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// POST /api/stories/:storyId/supporters/:id/upvote
router.post('/:id/upvote', async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const supporter = await prisma.supporter.update({
      where: { id },
      data: { upvotes: { increment: 1 } },
    });
    res.json({ success: true, data: supporter });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
