const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

// Aggregate stats for the dashboard overview (admin only)
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [
      totalSubscribers,
      publishedStories,
      pendingStories,
      totalStories,
      totalUsers,
      totalPledges,
      completedPledges,
      leads,
      supporters,
      avgTrust,
    ] = await Promise.all([
      prisma.subscriber.count(),
      prisma.story.count({ where: { status: 'approved' } }),
      prisma.story.count({ where: { status: 'pending' } }),
      prisma.story.count(),
      prisma.user.count(),
      prisma.pledge.count(),
      prisma.pledge.count({ where: { status: 'completed' } }),
      prisma.whyBroke.count(),
      prisma.supporter.count(),
      prisma.story.aggregate({ _avg: { trustScore: true } }),
    ]);

    const totalRaised = await prisma.pledge.aggregate({
      _sum: { amount: true },
      where: { status: 'completed' },
    });

    const stats = {
      totalSubscribers,
      totalUsers,
      publishedStories,
      pendingStories,
      totalStories,
      totalPledges,
      completedPledges,
      leads,
      supporters,
      totalRaised: totalRaised._sum.amount || 0,
      avgTrustScore: Math.round(avgTrust._avg.trustScore || 0),
    };

    res.json({ success: true, stats });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Recent activity feed across the platform (admin only)
router.get('/activity', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const [stories, supporters, pledges, subscribers, leads] = await Promise.all([
      prisma.story.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, title: true, businessName: true, status: true, createdAt: true } }),
      prisma.supporter.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, message: true, createdAt: true } }),
      prisma.pledge.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, amount: true, status: true, createdAt: true } }),
      prisma.subscriber.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, email: true, createdAt: true } }),
      prisma.whyBroke.findMany({ orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, createdAt: true } }),
    ]);

    const activity = [
      ...stories.map((s) => ({ type: 'story', text: `Story submitted: "${s.title}" (${s.businessName})`, status: s.status, at: s.createdAt })),
      ...supporters.map((s) => ({ type: 'support', text: `New community support from ${s.name}`, at: s.createdAt })),
      ...pledges.map((p) => ({ type: 'pledge', text: `Pledge of $${Number(p.amount).toLocaleString()} from ${p.name}`, status: p.status, at: p.createdAt })),
      ...subscribers.map((s) => ({ type: 'subscriber', text: `New newsletter subscriber: ${s.email}`, at: s.createdAt })),
      ...leads.map((l) => ({ type: 'lead', text: `New reality-check lead: ${l.name}`, at: l.createdAt })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 8);

    res.json({ success: true, activity });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Reality-check leads (admin only)
router.get('/leads', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const leads = await prisma.whyBroke.findMany({ orderBy: { createdAt: 'desc' } });
    res.json({ success: true, data: leads });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get site settings (admin only)
router.get('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const settings = await getOrCreateSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update site settings (admin only)
router.put('/settings', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { maintenanceMode, maintenanceMessage, adminEmail, siteNotice } = req.body;
    await prisma.siteSettings.upsert({
      where: { id: 1 },
      update: {
        ...(maintenanceMode !== undefined && { maintenanceMode: !!maintenanceMode }),
        ...(maintenanceMessage !== undefined && { maintenanceMessage: String(maintenanceMessage) }),
        ...(adminEmail !== undefined && { adminEmail: String(adminEmail) }),
        ...(siteNotice !== undefined && { siteNotice: String(siteNotice) }),
      },
      create: {
        maintenanceMode: maintenanceMode === true,
        maintenanceMessage: maintenanceMessage || "We're making improvements. Be back soon.",
        adminEmail: adminEmail || 'support@rubroke.com',
        siteNotice: siteNotice || '',
      },
    });
    const settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    res.json({ success: true, data: settings });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

async function getOrCreateSettings() {
  let settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
  if (!settings) {
    settings = await prisma.siteSettings.create({ data: { id: 1 } });
  }
  return settings;
}

// All community support across stories (admin only)
router.get('/supporters', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const supporters = await prisma.supporter.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        story: { select: { id: true, title: true, status: true } },
      },
    });
    res.json({ success: true, data: supporters });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// All pledges across stories (admin only)
router.get('/pledges', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const pledges = await prisma.pledge.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        story: { select: { id: true, title: true } },
      },
    });
    const totalRaised = pledges
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    res.json({ success: true, data: pledges, totalRaised });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
