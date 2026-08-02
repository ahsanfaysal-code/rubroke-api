const express = require('express');
const router = express.Router();
const prisma = require('../lib/prisma');

// Public: used by the frontend to show the maintenance banner / global notice.
router.get('/', async (req, res) => {
  try {
    let settings = await prisma.siteSettings.findUnique({ where: { id: 1 } });
    if (!settings) {
      settings = await prisma.siteSettings.create({ data: { id: 1 } });
    }
    res.json({
      success: true,
      data: {
        maintenanceMode: settings.maintenanceMode,
        maintenanceMessage: settings.maintenanceMessage,
        siteNotice: settings.siteNotice,
      },
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
