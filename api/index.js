// api/index.js — Vercel Serverless Function (Express)
// All /api/* requests are routed here by vercel.json
// HTML/static files are served by Vercel's CDN automatically (not through this file)

'use strict';

const express = require('express');
const cors    = require('cors');
const mongoose = require('mongoose');

const app = express();

// ── Middleware ──
app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));

// ── MongoDB Schemas & Models ──
// Guard: only define models once (Vercel can reuse warm Lambda instances)
const Account = mongoose.models.Account || mongoose.model('Account', new mongoose.Schema({
    username:    { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, trim: true },
    createdAt:   { type: Date, default: Date.now }
}));

const UserData = mongoose.models.UserData || mongoose.model('UserData', (() => {
    const s = new mongoose.Schema({
        username:  { type: String, required: true, trim: true, lowercase: true, index: true },
        key:       { type: String, required: true, trim: true, index: true },
        value:     { type: mongoose.Schema.Types.Mixed, default: null },
        updatedAt: { type: Date, default: Date.now }
    });
    s.index({ username: 1, key: 1 }, { unique: true });
    return s;
})());

// ── Database Connection (cached across warm serverless invocations) ──
let dbConnectionPromise = null;

function connectDB() {
    // Return existing connection/promise if already established
    if (mongoose.connection.readyState === 1) return Promise.resolve();
    if (dbConnectionPromise) return dbConnectionPromise;

    const MONGO_URI = process.env.MONGO_URI;

    if (!MONGO_URI) {
        return Promise.reject(new Error('MONGO_URI environment variable is not set. Add it in Vercel → Settings → Environment Variables.'));
    }

    dbConnectionPromise = mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,  // Fail fast if Atlas is unreachable (5 s)
        socketTimeoutMS: 10000,
        connectTimeoutMS: 5000,
        maxPoolSize: 5
    }).then(() => {
        console.log('[DB] Connected to MongoDB Atlas');
    }).catch(err => {
        dbConnectionPromise = null; // Allow retry on next request
        throw err;
    });

    return dbConnectionPromise;
}

// ── Middleware: connect DB before every API request ──
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        // Return clean JSON — never let the function hang or crash
        return res.status(503).json({
            success: false,
            error: 'Database unavailable: ' + err.message,
            hint: 'Set MONGO_URI in Vercel → Project Settings → Environment Variables → Redeploy'
        });
    }
});

// ── ROUTES ──

// Health Check
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
        uptime: process.uptime()
    });
});

// Accounts: Get all
app.get('/api/accounts', async (req, res) => {
    try {
        const accounts = await Account.find({}).sort({ createdAt: 1 });
        res.json({ success: true, accounts: accounts.map(a => ({ username: a.displayName || a.username })) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Create
app.post('/api/accounts', async (req, res) => {
    try {
        const rawUname = (req.body.username || '').trim();
        if (!rawUname) return res.status(400).json({ success: false, error: 'Username is required' });

        const lower = rawUname.toLowerCase();
        if (lower === 'yug' || lower === 'vipul')
            return res.status(400).json({ success: false, error: 'Reserved username' });

        const existing = await Account.findOne({ username: lower });
        if (existing)
            return res.json({ success: true, account: { username: existing.displayName || existing.username }, message: 'Account exists' });

        const newAcc = await Account.create({ username: lower, displayName: rawUname });
        res.status(201).json({ success: true, account: { username: newAcc.displayName || newAcc.username } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Accounts: Delete
app.delete('/api/accounts/:username', async (req, res) => {
    try {
        const lower = (req.params.username || '').trim().toLowerCase();
        await Account.deleteOne({ username: lower });
        res.json({ success: true, message: `Account ${lower} deleted` });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Get all keys
app.get('/api/data/:username', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const records = await UserData.find({ username: u });
        const dataMap = {};
        records.forEach(r => { dataMap[r.key] = r.value; });
        res.json({ success: true, data: dataMap });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Get specific key
app.get('/api/data/:username/:key', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        const record = await UserData.findOne({ username: u, key: req.params.key });
        res.json({ success: true, value: record ? record.value : null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Save / Upsert
app.post('/api/data/:username/:key', async (req, res) => {
    try {
        const u   = (req.params.username || '').trim().toLowerCase();
        const k   = req.params.key;
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

// User Data: Batch save
app.post('/api/data/:username/batch', async (req, res) => {
    try {
        const u    = (req.params.username || '').trim().toLowerCase();
        const items = req.body.items || {};
        const ops  = Object.keys(items).map(k => ({
            updateOne: {
                filter: { username: u, key: k },
                update: { $set: { username: u, key: k, value: items[k], updatedAt: new Date() } },
                upsert: true
            }
        }));
        if (ops.length > 0) await UserData.bulkWrite(ops);
        res.json({ success: true, count: ops.length });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// User Data: Delete specific key
app.delete('/api/data/:username/:key', async (req, res) => {
    try {
        const u = (req.params.username || '').trim().toLowerCase();
        await UserData.deleteOne({ username: u, key: req.params.key });
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// Export for Vercel serverless runtime
module.exports = app;
