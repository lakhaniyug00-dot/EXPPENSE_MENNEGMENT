require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/expense_management';
const AUTH_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'expense-management-cloud-secret-2026';

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve frontend static files
app.use(express.static(__dirname));

// Security & Password Utilities
function hashPassword(password, salt) {
    return crypto.pbkdf2Sync(String(password), String(salt), 10000, 64, 'sha512').toString('hex');
}

function generateToken(username) {
    const payload = `${username}:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`;
    const signature = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
    return Buffer.from(`${payload}:${signature}`).toString('base64');
}

function verifyToken(token) {
    if (!token) return null;
    try {
        const raw = Buffer.from(token, 'base64').toString('utf8');
        const parts = raw.split(':');
        if (parts.length < 4) return null;
        const username = parts[0];
        const timestamp = parts[1];
        const random = parts[2];
        const signature = parts[3];
        const payload = `${username}:${timestamp}:${random}`;
        const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(payload).digest('hex');
        if (crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig))) {
            return username.toLowerCase();
        }
    } catch (e) {
        return null;
    }
    return null;
}

// MongoDB Schemas & Models
const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, trim: true },
    passwordHash: { type: String, default: '' },
    salt: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date }
});

const userDataSchema = new mongoose.Schema({
    username: { type: String, required: true, trim: true, lowercase: true, index: true },
    key: { type: String, required: true, trim: true, index: true },
    value: { type: mongoose.Schema.Types.Mixed, default: null },
    updatedAt: { type: Date, default: Date.now, index: true }
});
userDataSchema.index({ username: 1, key: 1 }, { unique: true });

const Account = mongoose.models.Account || mongoose.model('Account', accountSchema);
const UserData = mongoose.models.UserData || mongoose.model('UserData', userDataSchema);

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
    });

mongoose.connection.on('disconnected', () => { isDbConnected = false; });
mongoose.connection.on('connected', () => { isDbConnected = true; });

// Auth check helper
function getAuthUser(req) {
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        const u = verifyToken(token);
        if (u) return u;
    }
    const headerUser = (req.headers['x-auth-user'] || '').trim().toLowerCase();
    if (headerUser) return headerUser;
    return null;
}

function requireUserAccess(req, res, next) {
    const targetUser = (req.params.username || '').trim().toLowerCase();
    const authUser = getAuthUser(req);
    if (authUser && targetUser && authUser !== targetUser) {
        return res.status(403).json({ success: false, error: 'Access denied: unauthorized account data' });
    }
    next();
}

// ── API ROUTES ──

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database: isDbConnected ? 'connected' : 'disconnected',
        configured: Boolean(process.env.MONGO_URI || isDbConnected),
        uptime: process.uptime()
    });
});

// Register
app.post('/api/auth/register', async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        const password = String(req.body.password || '').trim();
        const displayName = (req.body.displayName || rawUname).trim();

        if (!rawUname) return res.status(400).json({ success: false, error: 'Username is required' });
        if (!password || password.length < 3) return res.status(400).json({ success: false, error: 'Password must be at least 3 characters' });

        const lower = rawUname.toLowerCase();
        if (lower === 'yug' || lower === 'vipul') return res.status(400).json({ success: false, error: 'Reserved username' });

        const existing = await Account.findOne({ username: lower });
        if (existing) return res.status(400).json({ success: false, error: `Account "${rawUname}" already exists.` });

        const salt = crypto.randomBytes(16).toString('hex');
        const passwordHash = hashPassword(password, salt);

        const newAcc = await Account.create({
            username: lower,
            displayName: displayName,
            passwordHash: passwordHash,
            salt: salt,
            createdAt: new Date(),
            lastLogin: new Date()
        });

        const token = generateToken(lower);
        res.status(201).json({
            success: true,
            token: token,
            user: { username: newAcc.username, displayName: newAcc.displayName || newAcc.username }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Login
app.post('/api/auth/login', async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        const password = String(req.body.password || '').trim();

        if (!rawUname) return res.status(400).json({ success: false, error: 'Username is required' });

        const lower = rawUname.toLowerCase();
        let acc = await Account.findOne({ username: lower });

        if (!acc) {
            if (lower === 'valam') {
                const salt = crypto.randomBytes(16).toString('hex');
                const pHash = password ? hashPassword(password, salt) : '';
                acc = await Account.create({
                    username: 'valam',
                    displayName: 'Valam',
                    passwordHash: pHash,
                    salt: salt,
                    createdAt: new Date(),
                    lastLogin: new Date()
                });
            } else {
                return res.status(404).json({ success: false, error: `Account "${rawUname}" not found.` });
            }
        }

        if (acc.passwordHash) {
            if (!password) return res.status(400).json({ success: false, error: 'Password is required' });
            const testHash = hashPassword(password, acc.salt);
            if (testHash !== acc.passwordHash) return res.status(401).json({ success: false, error: 'Incorrect password' });
        } else if (password) {
            acc.salt = crypto.randomBytes(16).toString('hex');
            acc.passwordHash = hashPassword(password, acc.salt);
            await acc.save();
        }

        acc.lastLogin = new Date();
        await acc.save();

        const token = generateToken(acc.username);
        res.json({
            success: true,
            token: token,
            user: { username: acc.username, displayName: acc.displayName || acc.username, hasPassword: Boolean(acc.passwordHash) }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Get all accounts
app.get('/api/accounts', async (req, res) => {
    try {
        const hasValam = await Account.findOne({ username: 'valam' });
        if (!hasValam) {
            try { await Account.create({ username: 'valam', displayName: 'Valam' }); } catch (e) { }
        }
        const accounts = await Account.find({}).sort({ createdAt: 1 });
        res.json({
            success: true,
            accounts: accounts.map(a => ({ username: a.displayName || a.username, hasPassword: Boolean(a.passwordHash) }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Create new account
app.post('/api/accounts', async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        const password = String(req.body.password || '').trim();
        if (!rawUname) return res.status(400).json({ success: false, error: 'Username is required' });

        const lower = rawUname.toLowerCase();
        if (lower === 'yug' || lower === 'vipul') return res.status(400).json({ success: false, error: 'Reserved username' });

        const existing = await Account.findOne({ username: lower });
        if (existing) {
            return res.json({
                success: true,
                account: { username: existing.displayName || existing.username, hasPassword: Boolean(existing.passwordHash) },
                message: 'Account exists'
            });
        }

        let salt = '';
        let passwordHash = '';
        if (password) {
            salt = crypto.randomBytes(16).toString('hex');
            passwordHash = hashPassword(password, salt);
        }

        const newAcc = await Account.create({
            username: lower,
            displayName: rawUname,
            passwordHash: passwordHash,
            salt: salt,
            createdAt: new Date()
        });
        res.status(201).json({
            success: true,
            account: { username: newAcc.displayName || newAcc.username, hasPassword: Boolean(newAcc.passwordHash) }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Delete account
app.delete('/api/accounts/:username', requireUserAccess, async (req, res) => {
    try {
        const lower = (req.params.username || '').trim().toLowerCase();
        if (lower === 'valam') return res.status(400).json({ success: false, error: 'Valam is default account and cannot be deleted.' });
        await Account.deleteOne({ username: lower });
        await UserData.deleteMany({ username: lower });
        res.json({ success: true, message: `Account ${lower} deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Keys list
app.get('/api/data/:username/keys', requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const records = await UserData.find({ username: u }).select('key updatedAt').lean();
        res.json({ success: true, keys: records.map(r => r.key) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Delta sync
app.get('/api/data/:username/sync', requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const filter = { username: u };
        if (req.query.since) {
            const d = new Date(req.query.since);
            if (!isNaN(d.getTime())) filter.updatedAt = { $gt: d };
        }
        const records = await UserData.find(filter).lean();
        const dataMap = {};
        records.forEach(r => { dataMap[r.key] = r.value; });
        res.json({ success: true, data: dataMap, count: records.length, serverTime: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Full user data
app.get('/api/data/:username', requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const records = await UserData.find({ username: u }).lean();
        const dataMap = {};
        records.forEach(r => { dataMap[r.key] = r.value; });
        res.json({ success: true, data: dataMap, serverTime: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Get specific key
app.get('/api/data/:username/:key', requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        const record = await UserData.findOne({ username: u, key: k });
        res.json({ success: true, value: record ? record.value : null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Batch save
app.post('/api/data/:username/batch', requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const items = req.body.items || {};
        const now = new Date();

        const ops = Object.keys(items).map(k => ({
            updateOne: {
                filter: { username: u, key: k },
                update: { $set: { username: u, key: k, value: items[k], updatedAt: now } },
                upsert: true
            }
        }));

        if (ops.length > 0) {
            await UserData.bulkWrite(ops);
        }
        res.json({ success: true, count: ops.length, serverTime: now.toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Save specific key
app.post('/api/data/:username/:key', requireUserAccess, async (req, res) => {
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

// User Data: Delete specific key
app.delete('/api/data/:username/:key', requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        await UserData.deleteOne({ username: u, key: k });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Start local dev server
if (process.env.VERCEL !== '1' && require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`====================================================`);
        console.log(`🚀 Expense Management Server Running!`);
        console.log(`💻 Local PC Access:    http://localhost:${PORT}`);
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
}

module.exports = app;
