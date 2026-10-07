const router = require('express').Router();
const Config = require('../models/Config');

// Helper: get a config value by key
async function getConfig(key, defaultVal) {
  try {
    const doc = await Config.findOne({ key });
    return doc ? doc.value : defaultVal;
  } catch { return defaultVal; }
}

// Helper: set a config value
async function setConfig(key, value) {
  await Config.findOneAndUpdate({ key }, { $set: { value } }, { upsert: true, new: true });
}

// GET all config values
router.get('/', async (req, res) => {
  try {
    const [cats, masters, workers, company] = await Promise.all([
      getConfig('categories', ['Factory Karigar', 'Factory Expense']),
      getConfig('masters', ['Weaving', 'Dyeing', 'Finishing', 'Other']),
      getConfig('workers', []),
      getConfig('companyName', ''),
    ]);
    res.json({ categories: cats, masters, workers, companyName: company });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT categories
router.put('/categories', async (req, res) => {
  try {
    const { categories } = req.body;
    await setConfig('categories', categories);
    res.json({ success: true, categories });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT masters (sub-categories)
router.put('/masters', async (req, res) => {
  try {
    const { masters } = req.body;
    await setConfig('masters', masters);
    res.json({ success: true, masters });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT workers
router.put('/workers', async (req, res) => {
  try {
    const { workers } = req.body;
    await setConfig('workers', workers);
    res.json({ success: true, workers });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT company name
router.put('/company', async (req, res) => {
  try {
    const { companyName } = req.body;
    await setConfig('companyName', companyName);
    res.json({ success: true, companyName });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
