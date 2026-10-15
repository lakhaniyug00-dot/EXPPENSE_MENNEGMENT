require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const os = require('os');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expense_management';

// Middleware
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// Serve frontend static files from root directory
app.use(express.static(__dirname));

// MongoDB Schemas & Models
const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, trim: true },
    createdAt: { type: Date, default: Date.now }
});

const userDataSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true, lowercase: true, index: true },
    key: { type: String, required: true, trim: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now }
});

userDataSchema.index({ username: 1, key: 1 }, { unique: true });

const Account = mongoose.model('Account', accountSchema);
const UserData = mongoose.model('UserData', userDataSchema);

// Database Connection
let isDbConnected = false;
mongoose.connect(MONGO_URI)
    .then(() => {
        isDbConnected = true;
        console.log(`[Database] MongoDB connected successfully to: ${MONGO_URI}`);
    })
    .catch((err) => {
        isDbConnected = false;
        console.error('[Database] MongoDB connection error:', err.message);
        console.log('[Database] Server will continue running. Check MongoDB Service.');
    });

mongoose.connection.on('disconnected', () => { isDbConnected = false; });
mongoose.connection.on('connected', () => { isDbConnected = true; });

// ── API ROUTES ──

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database: isDbConnected ? 'connected' : 'disconnected',
        mongoUri: MONGO_URI.replace(/:[^:@]+@/, ':****@'),
        uptime: process.uptime()
    });
});

// Accounts: Get all accounts
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find({}).sort({ createdAt: 1 });
        res.json({ success: true, accounts: accounts.map(a => ({ username: a.displayName || a.username })) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Create new account (e.g. valam)
app.post('/api/accounts', async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        if (!rawUname) {
            return res.status(400).json({ success: false, error: 'Username is required' });
        }
        const lower = rawUname.toLowerCase();
        if (lower === 'yug' || lower === 'vipul') {
            return res.status(400).json({ success: false, error: 'Reserved username' });
        }

        const existing = await Account.findOne({ username: lower });
        if (existing) {
            return res.json({ success: true, account: { username: existing.displayName || existing.username }, message: 'Account exists' });
        }

        const newAcc = await Account.create({
            username: lower,
            displayName: rawUname
        });
        res.status(201).json({ success: true, account: { username: newAcc.displayName || newAcc.username } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Delete account
app.delete('/api/accounts/:username', async (req, res) => {
    try {
        const lower = (req.params.username || '').trim().toLowerCase();
        await Account.deleteOne({ username: lower });
        res.json({ success: true, message: `Account ${lower} deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Get all keys for a user
app.get('/api/data/:username', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const records = await UserData.find({ username: u });
        const dataMap = {};
        records.forEach(r => {
            dataMap[r.key] = r.value;
        });
        res.json({ success: true, data: dataMap });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Get specific key
app.get('/api/data/:username/:key', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        const record = await UserData.findOne({ username: u, key: k });
        res.json({ success: true, value: record ? record.value : null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Save / Upsert specific key
app.post('/api/data/:username/:key', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        const val = req.body.value !== undefined ? req.body.value : null;

        await UserData.findOneAndUpdate(
            { username: u, key: k },
            { username: u, key: k, value: val, updatedAt: new Date() },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Batch save multiple keys
app.post('/api/data/:username/batch', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const items = req.body.items || {}; // { [key]: value }

        const ops = Object.keys(items).map(k => ({
            updateOne: {
                filter: { username: u, key: k },
                update: { $set: { username: u, key: k, value: items[k], updatedAt: new Date() } },
                upsert: true
            }
        }));

        if (ops.length > 0) {
            await UserData.bulkWrite(ops);
        }
        res.json({ success: true, count: ops.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Delete specific key
app.delete('/api/data/:username/:key', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        await UserData.deleteOne({ username: u, key: k });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Fallback HTML route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Server
app.listen(PORT, '0.0.0.0', () => {
    console.log(`====================================================`);
    console.log(`🚀 Expense Management Dynamic Server Running!`);
    console.log(`💻 Local PC Access:    http://localhost:${PORT}`);

    // Print local network IP address for mobile access
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                console.log(`📱 Mobile/Phone Access: http://${net.address}:${PORT}`);
            }
        }
    }
    console.log(`📁 Database:          ${MONGO_URI}`);
    console.log(`====================================================`);
});
