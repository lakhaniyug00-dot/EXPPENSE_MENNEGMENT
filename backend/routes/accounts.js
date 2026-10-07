const router = require('express').Router();
const Account = require('../models/Account');

// GET all accounts
router.get('/', async (req, res) => {
  try {
    const accounts = await Account.find().sort({ name: 1 });
    res.json(accounts);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// GET single account by id
router.get('/:id', async (req, res) => {
  try {
    const acc = await Account.findOne({ id: req.params.id });
    if (!acc) return res.status(404).json({ error: 'Account not found' });
    res.json(acc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST create account
router.post('/', async (req, res) => {
  try {
    const { id, name } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const existing = await Account.findOne({ name: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (existing) return res.json(existing);
    const acc = await Account.create({ id: id || Date.now().toString(36), name, transactions: [] });
    res.status(201).json(acc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST add transaction to account
router.post('/:id/transactions', async (req, res) => {
  try {
    const { id, date, type, amount, note, ref } = req.body;
    const acc = await Account.findOne({ id: req.params.id });
    if (!acc) return res.status(404).json({ error: 'Account not found' });
    acc.transactions.push({ id: id || Date.now().toString(36), date, type, amount, note, ref });
    await acc.save();
    res.json(acc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE a transaction from account
router.delete('/:id/transactions/:txId', async (req, res) => {
  try {
    const acc = await Account.findOne({ id: req.params.id });
    if (!acc) return res.status(404).json({ error: 'Account not found' });
    acc.transactions = acc.transactions.filter(t => t.id !== req.params.txId);
    await acc.save();
    res.json(acc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT full account update (overwrite transactions)
router.put('/:id', async (req, res) => {
  try {
    const { transactions } = req.body;
    const acc = await Account.findOneAndUpdate(
      { id: req.params.id },
      { $set: { transactions } },
      { new: true }
    );
    if (!acc) return res.status(404).json({ error: 'Account not found' });
    res.json(acc);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE account
router.delete('/:id', async (req, res) => {
  try {
    await Account.findOneAndDelete({ id: req.params.id });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
