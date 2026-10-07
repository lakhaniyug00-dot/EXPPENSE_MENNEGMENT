require('dotenv').config();
const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');

const app = express();

// ── Middleware ──
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));

// ── Routes ──
app.use('/api/days',     require('./routes/days'));
app.use('/api/masters',  require('./routes/masters'));
app.use('/api/config',   require('./routes/config'));
app.use('/api/accounts', require('./routes/accounts'));

// Health check
app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date().toISOString() }));

// Serve frontend dist if available (for full single-server deployment)
const path = require('path');
const distPath = path.join(__dirname, '../frontend/dist');
if (require('fs').existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
}

// ── MongoDB connection & start ──
const PORT  = process.env.PORT || 5000;
const MONGO = process.env.MONGO_URI || 'mongodb://localhost:27017/expense_management';

mongoose.connect(MONGO)
  .then(() => {
    console.log('✅ MongoDB connected:', MONGO);
    app.listen(PORT, () => console.log(`🚀 Server running on http://localhost:${PORT}`));
  })
  .catch(err => {
    console.error('❌ MongoDB connection error:', err.message);
    process.exit(1);
  });
