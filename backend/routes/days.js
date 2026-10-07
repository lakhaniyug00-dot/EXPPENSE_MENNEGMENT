const router = require('express').Router();
const DayEntry = require('../models/DayEntry');

// GET a single day's data
router.get('/:dateKey', async (req, res) => {
  try {
    const doc = await DayEntry.findOne({ dateKey: req.params.dateKey });
    if (!doc) return res.json({ dateKey: req.params.dateKey, income: [], expense: [] });
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET all day keys (for net carry calculation)
router.get('/', async (req, res) => {
  try {
    const docs = await DayEntry.find({}, 'dateKey income expense').sort({ dateKey: 1 });
    res.json(docs);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT (upsert) a day's data
router.put('/:dateKey', async (req, res) => {
  try {
    const { income = [], expense = [] } = req.body;
    const doc = await DayEntry.findOneAndUpdate(
      { dateKey: req.params.dateKey },
      { $set: { income, expense } },
      { upsert: true, new: true }
    );
    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Rename a worker name across ALL day entries
router.post('/rename', async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
    const oldLower = oldName.toLowerCase();

    const allDays = await DayEntry.find({});
    let updatedCount = 0;
    for (const day of allDays) {
      let changed = false;
      day.income.forEach(e => {
        if (e.name && e.name.toLowerCase() === oldLower) { e.name = newName; changed = true; }
      });
      day.expense.forEach(e => {
        if (e.name && e.name.toLowerCase() === oldLower) { e.name = newName; changed = true; }
      });
      if (changed) { await day.save(); updatedCount++; }
    }
    res.json({ success: true, updatedDays: updatedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
