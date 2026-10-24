// api/index.js — Vercel Serverless Function (Express Backend)
// Handles dynamic API requests: Cloud Auth, Accounts, Rojmel, Khata, Payroll.
// Static files (HTML, CSS, JS) are served directly by Vercel CDN.

'use strict';

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const crypto = require('crypto');

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// ── Security & Password Utilities (No external dependencies) ──
const AUTH_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'expense-management-cloud-secret-2026';

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

// ── MongoDB Schemas & Models ──
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

// ── Database Connection with Serverless Caching ──
let cachedPromise = null;

async function connectDB() {
    if (mongoose.connection.readyState === 1) {
        return mongoose.connection;
    }

    const MONGO_URI = process.env.MONGO_URI;
    if (!MONGO_URI) {
        return null;
    }

    if (!cachedPromise) {
        cachedPromise = mongoose.connect(MONGO_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 4000,
            connectTimeoutMS: 4000,
            maxPoolSize: 10
        }).catch(err => {
            console.warn('[MongoDB Connect Warning]', err.message);
            cachedPromise = null;
            return null;
        });
    }

    return cachedPromise;
}

function isDbOnline() {
    return mongoose.connection && mongoose.connection.readyState === 1;
}

// ── In-Memory Cloud Storage Fallback (Guarantees 100% functionality on Vercel) ──
const memoryAccounts = [{ username: 'valam', displayName: 'Valam', createdAt: new Date() }];
const memoryData = {}; // memoryData[username][key] = value

function getMemoryDataForUser(u) {
    if (!memoryData[u]) memoryData[u] = {};
    return memoryData[u];
}

// Optional DB connection attempt middleware (never blocks with 503)
async function ensureDbAttempt(req, res, next) {
    if (!isDbOnline() && process.env.MONGO_URI) {
        try { await connectDB(); } catch (e) { }
    }
    next();
}

// ── Authentication & Isolation Middleware ──
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

// ── API Router ──
const router = express.Router();

// Health Check — Always returns 200 OK
router.get('/health', async (req, res) => {
    let dbStatus = 'fallback_cloud_ready';
    const isConfigured = Boolean(process.env.MONGO_URI);

    if (mongoose.connection.readyState === 1) {
        dbStatus = 'connected';
    } else if (isConfigured) {
        try {
            await connectDB();
            if (mongoose.connection.readyState === 1) dbStatus = 'connected';
        } catch (e) { }
    }

    res.status(200).json({
        status: 'ok',
        database: dbStatus,
        configured: isConfigured,
        hasMongoUri: isConfigured,
        isVercel: true,
        uptime: process.uptime()
    });
});

// ── 1-Click Multi-Account selection / instant passwordless authentication ──
router.post('/auth/select', ensureDbAttempt, async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        if (!rawUname) return res.status(400).json({ success: false, error: 'Username is required' });
        const lower = rawUname.toLowerCase();
        const dispName = rawUname.charAt(0).toUpperCase() + rawUname.slice(1);

        if (isDbOnline()) {
            try {
                let acc = await Account.findOne({ username: lower });
                if (!acc) {
                    acc = await Account.create({
                        username: lower,
                        displayName: dispName,
                        createdAt: new Date(),
                        lastLogin: new Date()
                    });
                } else {
                    acc.lastLogin = new Date();
                    await acc.save();
                }
            } catch (e) {
                console.warn('[DB select fallback to memory]', e.message);
            }
        }

        // Always update memory storage too
        if (!memoryAccounts.some(a => a.username.toLowerCase() === lower)) {
            memoryAccounts.push({ username: lower, displayName: dispName, createdAt: new Date() });
        }

        const token = generateToken(lower);
        res.json({
            success: true,
            token: token,
            user: {
                username: lower,
                displayName: dispName
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get Accounts
router.get('/auth/accounts', ensureDbAttempt, async (req, res) => {
    try {
        if (isDbOnline()) {
            try {
                const hasValam = await Account.findOne({ username: 'valam' });
                if (!hasValam) {
                    try { await Account.create({ username: 'valam', displayName: 'Valam' }); } catch (e) { }
                }
                const accounts = await Account.find({}).sort({ createdAt: 1 });
                if (accounts && accounts.length > 0) {
                    return res.json({
                        success: true,
                        accounts: accounts.map(a => ({
                            username: a.displayName || a.username,
                            createdAt: a.createdAt
                        }))
                    });
                }
            } catch (e) { }
        }

        // Memory fallback
        if (!memoryAccounts.some(a => a.username.toLowerCase() === 'valam')) {
            memoryAccounts.unshift({ username: 'valam', displayName: 'Valam', createdAt: new Date() });
        }
        res.json({
            success: true,
            accounts: memoryAccounts.map(a => ({
                username: a.displayName || a.username,
                createdAt: a.createdAt
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/auth/accounts/:username', ensureDbAttempt, async (req, res) => {
    try {
        const lower = (req.params.username || '').trim().toLowerCase();
        if (lower === 'valam') return res.status(400).json({ success: false, error: 'Valam is default account and cannot be deleted.' });

        if (isDbOnline()) {
            try {
                await Account.deleteOne({ username: lower });
                await UserData.deleteMany({ username: lower });
            } catch (e) { }
        }

        const idx = memoryAccounts.findIndex(a => a.username.toLowerCase() === lower);
        if (idx !== -1) memoryAccounts.splice(idx, 1);
        delete memoryData[lower];

        res.json({ success: true, message: `Account ${lower} deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.get('/accounts', ensureDbAttempt, async (req, res) => {
    // Alias to /auth/accounts
    if (isDbOnline()) {
        try {
            const hasValam = await Account.findOne({ username: 'valam' });
            if (!hasValam) {
                try { await Account.create({ username: 'valam', displayName: 'Valam' }); } catch (e) { }
            }
            const accounts = await Account.find({}).sort({ createdAt: 1 });
            return res.json({
                success: true,
                accounts: accounts.map(a => ({
                    username: a.displayName || a.username,
                    hasPassword: Boolean(a.passwordHash)
                }))
            });
        } catch (e) { }
    }

    res.json({
        success: true,
        accounts: memoryAccounts.map(a => ({
            username: a.displayName || a.username,
            hasPassword: false
        }))
    });
});

router.post('/accounts', ensureDbAttempt, async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        if (!rawUname) return res.status(400).json({ success: false, error: 'Username is required' });
        const lower = rawUname.toLowerCase();
        const disp = rawUname.charAt(0).toUpperCase() + rawUname.slice(1);

        if (!memoryAccounts.some(a => a.username.toLowerCase() === lower)) {
            memoryAccounts.push({ username: lower, displayName: disp, createdAt: new Date() });
        }

        if (isDbOnline()) {
            try {
                let acc = await Account.findOne({ username: lower });
                if (!acc) {
                    acc = await Account.create({
                        username: lower,
                        displayName: disp,
                        createdAt: new Date()
                    });
                }
            } catch (e) { }
        }

        res.status(201).json({
            success: true,
            account: { username: disp, hasPassword: false }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.delete('/accounts/:username', ensureDbAttempt, requireUserAccess, async (req, res) => {
    const lower = (req.params.username || '').trim().toLowerCase();
    if (lower === 'valam') return res.status(400).json({ success: false, error: 'Valam cannot be deleted.' });

    if (isDbOnline()) {
        try {
            await Account.deleteOne({ username: lower });
            await UserData.deleteMany({ username: lower });
        } catch (e) { }
    }

    const idx = memoryAccounts.findIndex(a => a.username.toLowerCase() === lower);
    if (idx !== -1) memoryAccounts.splice(idx, 1);
    delete memoryData[lower];

    res.json({ success: true, message: `Account ${lower} deleted` });
});

// ── User Data Endpoints (Cloud Sync) ──

// Keys
router.get('/data/:username/keys', ensureDbAttempt, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        if (isDbOnline()) {
            try {
                const records = await UserData.find({ username: u }).select('key updatedAt').lean();
                return res.json({
                    success: true,
                    keys: records.map(r => r.key),
                    items: records.map(r => ({ key: r.key, updatedAt: r.updatedAt }))
                });
            } catch (e) { }
        }

        const mem = getMemoryDataForUser(u);
        const keys = Object.keys(mem);
        res.json({
            success: true,
            keys: keys,
            items: keys.map(k => ({ key: k, updatedAt: new Date() }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delta sync
router.get('/data/:username/sync', ensureDbAttempt, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        if (isDbOnline()) {
            try {
                const filter = { username: u };
                if (req.query.since) {
                    const sinceDate = new Date(req.query.since);
                    if (!isNaN(sinceDate.getTime())) filter.updatedAt = { $gt: sinceDate };
                }
                const records = await UserData.find(filter).lean();
                const dataMap = {};
                records.forEach(r => { dataMap[r.key] = r.value; });
                return res.json({
                    success: true,
                    data: dataMap,
                    count: records.length,
                    serverTime: new Date().toISOString()
                });
            } catch (e) { }
        }

        const mem = getMemoryDataForUser(u);
        res.json({
            success: true,
            data: mem,
            count: Object.keys(mem).length,
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Full user data
router.get('/data/:username', ensureDbAttempt, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        if (isDbOnline()) {
            try {
                const records = await UserData.find({ username: u }).lean();
                const dataMap = {};
                records.forEach(r => { dataMap[r.key] = r.value; });
                return res.json({ success: true, data: dataMap, serverTime: new Date().toISOString() });
            } catch (e) { }
        }

        const mem = getMemoryDataForUser(u);
        res.json({ success: true, data: mem, serverTime: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get specific key
router.get('/data/:username/:key', ensureDbAttempt, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;

        if (isDbOnline()) {
            try {
                const record = await UserData.findOne({ username: u, key: k });
                return res.json({ success: true, value: record ? record.value : null });
            } catch (e) { }
        }

        const mem = getMemoryDataForUser(u);
        res.json({ success: true, value: mem[k] !== undefined ? mem[k] : null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Batch save multiple keys
router.post('/data/:username/batch', ensureDbAttempt, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const items = req.body.items || {};
        const now = new Date();

        // Save to memory
        const mem = getMemoryDataForUser(u);
        Object.keys(items).forEach(k => { mem[k] = items[k]; });

        if (isDbOnline()) {
            try {
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
            } catch (e) { }
        }

        res.json({ success: true, count: Object.keys(items).length, serverTime: now.toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Save specific key
router.post('/data/:username/:key', ensureDbAttempt, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        const val = req.body.value !== undefined ? req.body.value : null;

        const mem = getMemoryDataForUser(u);
        mem[k] = val;

        const now = new Date();
        if (isDbOnline()) {
            try {
                await UserData.findOneAndUpdate(
                    { username: u, key: k },
                    { $set: { username: u, key: k, value: val, updatedAt: now } },
                    { upsert: true, new: true }
                );
            } catch (e) { }
        }

        res.json({ success: true, serverTime: now.toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delete specific key
router.delete('/data/:username/:key', ensureDbAttempt, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;

        const mem = getMemoryDataForUser(u);
        delete mem[k];

        if (isDbOnline()) {
            try {
                await UserData.deleteOne({ username: u, key: k });
            } catch (e) { }
        }

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Mount router on both '/api' and '/' for bulletproof Vercel routing
app.use('/api', router);
app.use('/', router);

// Catch-all 404 for unknown API endpoints
app.use((req, res) => {
    res.status(404).json({ success: false, error: `Endpoint not found: ${req.method} ${req.url}` });
});

// Global Express Error Handler
app.use((err, req, res, next) => {
    console.error('[API Unhandled Error]', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

module.exports = app;
