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
        throw new Error('MONGO_URI is not set. Please add MONGO_URI in Vercel Settings -> Environment Variables.');
    }

    if (!cachedPromise) {
        cachedPromise = mongoose.connect(MONGO_URI, {
            bufferCommands: false,
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            maxPoolSize: 10
        }).catch(err => {
            cachedPromise = null;
            throw err;
        });
    }

    return cachedPromise;
}

// ── Middleware for Database-Dependent Routes ──
async function requireDB(req, res, next) {
    try {
        await connectDB();
        next();
    } catch (err) {
        return res.status(503).json({
            success: false,
            error: err.message || 'Database unavailable',
            hint: 'Set MONGO_URI in Vercel Dashboard -> Settings -> Environment Variables and redeploy.'
        });
    }
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
    // If auth token provided and does not match target, deny access
    if (authUser && targetUser && authUser !== targetUser) {
        return res.status(403).json({ success: false, error: 'Access denied: unauthorized account data' });
    }
    next();
}

// ── API Router ──
const router = express.Router();

// Health Check — Always returns 200 OK
router.get('/health', async (req, res) => {
    let dbStatus = 'disconnected';
    const isConfigured = Boolean(process.env.MONGO_URI);

    if (mongoose.connection.readyState === 1) {
        dbStatus = 'connected';
    } else if (isConfigured) {
        try {
            await connectDB();
            dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
        } catch (e) {
            dbStatus = 'disconnected';
        }
    }

    res.status(200).json({
        status: 'ok',
        database: dbStatus,
        configured: isConfigured,
        uptime: process.uptime()
    });
});

// ── Authentication Endpoints ──

// Register new account with credentials
router.post('/auth/register', requireDB, async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        const password = String(req.body.password || '').trim();
        const displayName = (req.body.displayName || rawUname).trim();

        if (!rawUname) {
            return res.status(400).json({ success: false, error: 'Username is required' });
        }
        if (!password || password.length < 3) {
            return res.status(400).json({ success: false, error: 'Password must be at least 3 characters' });
        }

        const lower = rawUname.toLowerCase();
        if (lower === 'yug' || lower === 'vipul') {
            return res.status(400).json({ success: false, error: 'This username is reserved' });
        }

        const existing = await Account.findOne({ username: lower });
        if (existing) {
            return res.status(400).json({ success: false, error: `Account "${rawUname}" already exists. Please log in.` });
        }

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
            user: {
                username: newAcc.username,
                displayName: newAcc.displayName || newAcc.username
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Login with credentials
router.post('/auth/login', requireDB, async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        const password = String(req.body.password || '').trim();

        if (!rawUname) {
            return res.status(400).json({ success: false, error: 'Username is required' });
        }

        const lower = rawUname.toLowerCase();
        let acc = await Account.findOne({ username: lower });

        // If account does not exist, check if it's default 'valam' or auto-create if no accounts exist
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
                return res.status(404).json({ success: false, error: `Account "${rawUname}" not found. Please create an account.` });
            }
        }

        // Check password if account has password set
        if (acc.passwordHash) {
            if (!password) {
                return res.status(400).json({ success: false, error: 'Password is required' });
            }
            const testHash = hashPassword(password, acc.salt);
            if (testHash !== acc.passwordHash) {
                return res.status(401).json({ success: false, error: 'Incorrect password. Please try again.' });
            }
        } else if (password) {
            // First time password setup for previously password-less account
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
            user: {
                username: acc.username,
                displayName: acc.displayName || acc.username,
                hasPassword: Boolean(acc.passwordHash)
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── Accounts Endpoints (For UI Chips & Management) ──
router.get('/accounts', requireDB, async (req, res) => {
    try {
        // Ensure Valam always exists in database
        const hasValam = await Account.findOne({ username: 'valam' });
        if (!hasValam) {
            try {
                await Account.create({
                    username: 'valam',
                    displayName: 'Valam',
                    createdAt: new Date()
                });
            } catch (e) { }
        }

        const accounts = await Account.find({}).sort({ createdAt: 1 });
        res.json({
            success: true,
            accounts: accounts.map(a => ({
                username: a.displayName || a.username,
                hasPassword: Boolean(a.passwordHash)
            }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/accounts', requireDB, async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        const password = String(req.body.password || '').trim();

        if (!rawUname) {
            return res.status(400).json({ success: false, error: 'Username is required' });
        }
        const lower = rawUname.toLowerCase();
        if (lower === 'yug' || lower === 'vipul') {
            return res.status(400).json({ success: false, error: 'Reserved username' });
        }

        const existing = await Account.findOne({ username: lower });
        if (existing) {
            if (password && !existing.passwordHash) {
                existing.salt = crypto.randomBytes(16).toString('hex');
                existing.passwordHash = hashPassword(password, existing.salt);
                await existing.save();
            }
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

router.delete('/accounts/:username', requireDB, requireUserAccess, async (req, res) => {
    try {
        const lower = (req.params.username || '').trim().toLowerCase();
        if (lower === 'valam') {
            return res.status(400).json({ success: false, error: 'Valam is the default account and cannot be deleted.' });
        }
        await Account.deleteOne({ username: lower });
        await UserData.deleteMany({ username: lower });
        res.json({ success: true, message: `Account ${lower} deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ── User Data Endpoints (Cross-Device Cloud Sync) ──

// Get list of all data keys for a user
router.get('/data/:username/keys', requireDB, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const records = await UserData.find({ username: u }).select('key updatedAt').lean();
        res.json({
            success: true,
            keys: records.map(r => r.key),
            items: records.map(r => ({ key: r.key, updatedAt: r.updatedAt }))
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Delta sync: get keys updated since timestamp
router.get('/data/:username/sync', requireDB, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const sinceParam = req.query.since;
        const filter = { username: u };
        if (sinceParam) {
            const sinceDate = new Date(sinceParam);
            if (!isNaN(sinceDate.getTime())) {
                filter.updatedAt = { $gt: sinceDate };
            }
        }

        const records = await UserData.find(filter).lean();
        const dataMap = {};
        let latestTime = null;

        records.forEach(r => {
            dataMap[r.key] = r.value;
            if (!latestTime || r.updatedAt > latestTime) {
                latestTime = r.updatedAt;
            }
        });

        res.json({
            success: true,
            data: dataMap,
            count: records.length,
            serverTime: new Date().toISOString()
        });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get all keys for a user (initial full load)
router.get('/data/:username', requireDB, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const records = await UserData.find({ username: u }).lean();
        const dataMap = {};
        records.forEach(r => {
            dataMap[r.key] = r.value;
        });
        res.json({ success: true, data: dataMap, serverTime: new Date().toISOString() });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Get specific key
router.get('/data/:username/:key', requireDB, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        const record = await UserData.findOne({ username: u, key: k });
        res.json({ success: true, value: record ? record.value : null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Batch save multiple keys (used for initial migration and bulk sync)
router.post('/data/:username/batch', requireDB, requireUserAccess, async (req, res) => {
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

// Save / Upsert specific key
router.post('/data/:username/:key', requireDB, requireUserAccess, async (req, res) => {
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

// Delete specific key
router.delete('/data/:username/:key', requireDB, requireUserAccess, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        await UserData.deleteOne({ username: u, key: k });
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
