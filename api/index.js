// api/index.js — Vercel Serverless Function (Express Backend)
// Handles all dynamic API requests: Accounts, Rojmel, Khata, Payroll.
// Static files (HTML, CSS, JS) are served directly by Vercel CDN.

'use strict';

const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// ── MongoDB Schemas & Models ──
// Use existing compiled model if warm lambda is reused
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
            bufferCommands: false,         // Never buffer queries in serverless
            serverSelectionTimeoutMS: 5000, // 5s timeout instead of hanging
            connectTimeoutMS: 5000,
            maxPoolSize: 10
        }).catch(err => {
            cachedPromise = null;
            throw err;
        });
    }

    return cachedPromise;
}

// ── API Router ──
// We mount all routes on a router and attach it to BOTH '/' and '/api'
// This ensures that whether Vercel rewrites preserve '/api' or strip it,
// every single route resolves accurately without 404 or invocation error.
const router = express.Router();

// Health Check — NEVER fails, always returns 200 OK so frontend can initialize cleanly
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

// Middleware for database-dependent routes
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

// Accounts: Get all accounts
router.get('/accounts', requireDB, async (req, res) => {
    try {
        const accounts = await Account.find({}).sort({ createdAt: 1 });
        res.json({ success: true, accounts: accounts.map(a => ({ username: a.displayName || a.username })) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Create new account
router.post('/accounts', requireDB, async (req, res) => {
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
router.delete('/accounts/:username', requireDB, async (req, res) => {
    try {
        const lower = (req.params.username || '').trim().toLowerCase();
        await Account.deleteOne({ username: lower });
        res.json({ success: true, message: `Account ${lower} deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Get all keys for a user
router.get('/data/:username', requireDB, async (req, res) => {
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
router.get('/data/:username/:key', requireDB, async (req, res) => {
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
router.post('/data/:username/:key', requireDB, async (req, res) => {
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
router.post('/data/:username/batch', requireDB, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const items = req.body.items || {};

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
router.delete('/data/:username/:key', requireDB, async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const k = req.params.key;
        await UserData.deleteOne({ username: u, key: k });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Mount router on both '/api' and '/' for bulletproof routing
app.use('/api', router);
app.use('/', router);

// Catch-all 404 for unknown API endpoints
app.use((req, res) => {
    res.status(404).json({ success: false, error: `Endpoint not found: ${req.method} ${req.url}` });
});

// Global Express Error Handler — guarantees the Lambda function never throws an unhandled error
app.use((err, req, res, next) => {
    console.error('[API Unhandled Error]', err);
    res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

// Export the Express app as the serverless function handler
module.exports = app;
