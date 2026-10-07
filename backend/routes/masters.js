const router = require('express').Router();
const MasterEntry = require('../models/MasterEntry');
const Account     = require('../models/Account');
const DayEntry    = require('../models/DayEntry');
const Config      = require('../models/Config');

// GET all master entries
router.get('/', async (req, res) => {
  try {
    const entries = await MasterEntry.find().sort({ name: 1 });
    res.json(entries);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST upsert a master entry (by name)
router.post('/', async (req, res) => {
  try {
    const { name, category, master, fixedLabel, pagarAmount, note, amount, id } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const doc = await MasterEntry.findOneAndUpdate(
      { name: { $regex: new RegExp(`^${name}$`, 'i') } },
      { $set: { name, category, master, fixedLabel, pagarAmount, note, amount, id } },
      { upsert: true, new: true }
    );

    // Also ensure Account exists for this name in Khata
    const existingAcc = await Account.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (!existingAcc) {
      await Account.create({ id: id || Date.now().toString(36), name, transactions: [] });
    }

    res.json(doc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT rename a master (and cascade to all day entries + accounts)
router.put('/rename', async (req, res) => {
  try {
    const { oldName, newName } = req.body;
    if (!oldName || !newName) return res.status(400).json({ error: 'oldName and newName required' });
    const oldRegex = new RegExp(`^${oldName}$`, 'i');

    // 1. MasterEntry
    await MasterEntry.findOneAndUpdate({ name: oldRegex }, { $set: { name: newName } });

    // 2. Workers in Config
    const workersDoc = await Config.findOne({ key: 'workers' });
    if (workersDoc && Array.isArray(workersDoc.value)) {
      workersDoc.value = workersDoc.value.map(w =>
        w && w.toLowerCase() === oldName.toLowerCase() ? newName : w
      );
      await workersDoc.save();
    }

    // 3. Accounts
    await Account.findOneAndUpdate({ name: oldRegex }, { $set: { name: newName } });

    // 4. All DayEntries
    const allDays = await DayEntry.find({});
    for (const day of allDays) {
      let changed = false;
      day.income.forEach(e => {
        if (e.name && e.name.toLowerCase() === oldName.toLowerCase()) { e.name = newName; changed = true; }
      });
      day.expense.forEach(e => {
        if (e.name && e.name.toLowerCase() === oldName.toLowerCase()) { e.name = newName; changed = true; }
      });
      if (changed) await day.save();
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE a master entry (and remove from all day entries, accounts)
router.delete('/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const nameLower = name.toLowerCase();

    await MasterEntry.findOneAndDelete({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    await Account.findOneAndDelete({ name: { $regex: new RegExp(`^${name}$`, 'i') } });

    // Remove from workers config
    const workersDoc = await Config.findOne({ key: 'workers' });
    if (workersDoc && Array.isArray(workersDoc.value)) {
      workersDoc.value = workersDoc.value.filter(w => w && w.toLowerCase() !== nameLower);
      await workersDoc.save();
    }

    // Remove from day entries
    const allDays = await DayEntry.find({});
    for (const day of allDays) {
      let changed = false;
      const incBefore = day.income.length;
      day.income = day.income.filter(e => !e.name || e.name.toLowerCase() !== nameLower);
      const expBefore = day.expense.length;
      day.expense = day.expense.filter(e => !e.name || e.name.toLowerCase() !== nameLower);
      if (day.income.length !== incBefore || day.expense.length !== expBefore) changed = true;
      if (changed) await day.save();
    }

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
