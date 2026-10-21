/**
 * AppAPI - Dynamic Frontend-to-Backend Bridge for Cloud MongoDB & Express
 * Provides cross-device authentication, real-time cloud data synchronization,
 * offline caching, local-to-cloud data migration, and status indicators.
 */
(function (window) {
    'use strict';

    // API_BASE: relative paths on Vercel or same-origin.
    // Local dev fallback if served from a static server (e.g. port 5500)
    const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        && window.location.port !== '5000'
        && window.location.port !== ''
        ? (window.location.protocol + '//' + window.location.hostname + ':5000')
        : '';

    let isBackendActive = false;
    let isDbConnected = false;
    let isConfigured = false;
    let lastSyncTime = null;
    let syncInterval = null;
    const syncListeners = [];

    let initPromiseResolve = null;
    const initPromise = new Promise(resolve => {
        initPromiseResolve = resolve;
    });

    function getAuthToken() {
        return localStorage.getItem('auth_token') || '';
    }

    function getActiveUser() {
        return (localStorage.getItem('auth_user') || '').trim().toLowerCase();
    }

    function getHeaders(extraHeaders) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getAuthToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const u = getActiveUser();
        if (u) headers['X-Auth-User'] = u;
        return Object.assign(headers, extraHeaders || {});
    }

    const AppAPI = {
        API_BASE: API_BASE,

        isAvailable: function () {
            return isBackendActive && isDbConnected;
        },

        getDbStatus: function () {
            return {
                server: isBackendActive,
                database: isDbConnected,
                configured: isConfigured
            };
        },

        // Wait for cloud sync to be ready before page renders
        ready: function () {
            return initPromise;
        },

        onSync: function (callback) {
            if (typeof callback === 'function') {
                syncListeners.push(callback);
            }
        },

        notifySyncListeners: function (changedKeys) {
            syncListeners.forEach(fn => {
                try { fn(changedKeys); } catch (e) { console.error('[Sync Listener Error]', e); }
            });
        },

        init: async function () {
            try {
                const res = await fetch(API_BASE + '/api/health', {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' }
                });

                if (res.ok) {
                    const data = await res.json();
                    isBackendActive = true;
                    isDbConnected = data.database === 'connected';
                    isConfigured = Boolean(data.configured);

                    this.updateStatusBadge();

                    // If DB is connected and user is logged in, perform full cloud sync
                    const user = getActiveUser();
                    if (isDbConnected && user && user !== 'yug' && user !== 'vipul') {
                        await this.syncUserDataFromBackend();
                        this.startPeriodicSync();
                    } else if (isDbConnected) {
                        await this.syncAccountsFromBackend();
                    }
                } else {
                    isBackendActive = false;
                    isDbConnected = false;
                    this.updateStatusBadge();
                }
            } catch (err) {
                isBackendActive = false;
                isDbConnected = false;
                this.updateStatusBadge();
            } finally {
                if (initPromiseResolve) {
                    initPromiseResolve(true);
                }
            }
        },

        startPeriodicSync: function () {
            if (syncInterval) clearInterval(syncInterval);
            // Poll for remote changes every 10 seconds
            syncInterval = setInterval(() => {
                this.pollSync();
            }, 10000);

            // Instant sync on window focus or mobile wake-up
            if (!this._listenersBound) {
                this._listenersBound = true;
                window.addEventListener('focus', () => this.pollSync());
                document.addEventListener('visibilitychange', () => {
                    if (document.visibilityState === 'visible') this.pollSync();
                });
            }
        },

        pollSync: async function () {
            const u = getActiveUser();
            if (!isBackendActive || !isDbConnected || !u) return;

            try {
                let url = API_BASE + '/api/data/' + encodeURIComponent(u) + '/sync';
                if (lastSyncTime) {
                    url += '?since=' + encodeURIComponent(lastSyncTime);
                }
                const res = await fetch(url, { headers: getHeaders() });
                if (res.ok) {
                    const json = await res.json();
                    if (json.success && json.data) {
                        const keys = Object.keys(json.data);
                        if (keys.length > 0) {
                            const prefix = `u:${u}:`;
                            keys.forEach(k => {
                                const val = json.data[k];
                                const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                                localStorage.setItem(prefix + k, strVal);
                            });
                            this.notifySyncListeners(keys);
                        }
                        if (json.serverTime) lastSyncTime = json.serverTime;
                    }
                }
            } catch (e) { }
        },

        updateStatusBadge: function () {
            // Update #backendStatusBadge (login page)
            const el = document.getElementById('backendStatusBadge');
            if (el) {
                if (isBackendActive && isDbConnected) {
                    el.style.background = '#ECFDF5';
                    el.style.border = '1px solid #10B981';
                    el.style.color = '#065F46';
                    el.innerHTML = '🟢 Cloud Database (MongoDB)';
                    el.title = 'Live Cloud MongoDB Connected — All data syncs across devices.';
                } else if (isBackendActive && !isDbConnected) {
                    el.style.background = '#FFFBEB';
                    el.style.border = '1px solid #F59E0B';
                    el.style.color = '#B45309';
                    el.innerHTML = '🟡 Server Up (MongoDB Disconnected)';
                    el.title = 'Serverless backend running. MONGO_URI needs to be set in Vercel.';
                } else {
                    el.style.background = '#F8FAFC';
                    el.style.border = '1px solid #E2E8F0';
                    el.style.color = '#64748B';
                    el.innerHTML = '⚪ Offline (Local Storage)';
                    el.title = 'Running in offline local storage mode.';
                }
            }

            // Update .cloud-sync-badge across main app headers
            const headerBadges = document.querySelectorAll('.cloud-sync-badge');
            headerBadges.forEach(b => {
                if (isBackendActive && isDbConnected) {
                    b.style.background = '#ECFDF5';
                    b.style.border = '1px solid #10B981';
                    b.style.color = '#065F46';
                    b.innerHTML = '🟢 Cloud Synced';
                    b.title = 'Connected to Cloud MongoDB. Changes sync live across all phones and PCs.';
                } else if (isBackendActive && !isDbConnected) {
                    b.style.background = '#FFFBEB';
                    b.style.border = '1px solid #F59E0B';
                    b.style.color = '#B45309';
                    b.innerHTML = '🟡 DB Disconnected';
                    b.title = 'Vercel backend is active, but MongoDB is not connected.';
                } else {
                    b.style.background = '#F8FAFC';
                    b.style.border = '1px solid #CBD5E1';
                    b.style.color = '#64748B';
                    b.innerHTML = '⚪ Local Storage';
                    b.title = 'Using local browser cache only.';
                }
            });
        },

        // ── Authentication API ──
        register: async function (username, password, displayName) {
            try {
                const res = await fetch(API_BASE + '/api/auth/register', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        username: username,
                        password: password,
                        displayName: displayName || username
                    })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('auth_user', data.user.username);
                    localStorage.setItem('auth_user_name', data.user.displayName || data.user.username);
                    return { success: true, user: data.user };
                }
                return { success: false, error: data.error || 'Registration failed' };
            } catch (err) {
                return { success: false, error: err.message || 'Network error' };
            }
        },

        login: async function (username, password) {
            try {
                const res = await fetch(API_BASE + '/api/auth/login', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username, password: password })
                });
                const data = await res.json();
                if (data.success && data.token) {
                    localStorage.setItem('auth_token', data.token);
                    localStorage.setItem('auth_user', data.user.username);
                    localStorage.setItem('auth_user_name', data.user.displayName || data.user.username);
                    return { success: true, user: data.user };
                }
                return { success: false, error: data.error || 'Login failed' };
            } catch (err) {
                return { success: false, error: err.message || 'Network error' };
            }
        },

        logout: function () {
            localStorage.removeItem('auth_user');
            localStorage.removeItem('auth_user_name');
            localStorage.removeItem('auth_token');
            window.location.href = 'login.html';
        },

        // ── Accounts API ──
        loadAccounts: async function () {
            if (!isBackendActive) return null;
            try {
                const res = await fetch(API_BASE + '/api/accounts', { headers: getHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && Array.isArray(data.accounts)) {
                        return data.accounts;
                    }
                }
            } catch (e) { }
            return null;
        },

        saveAccount: async function (username, password) {
            if (!isBackendActive) return;
            try {
                await fetch(API_BASE + '/api/accounts', {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({ username: username, password: password || '' })
                });
            } catch (e) { }
        },

        deleteAccount: async function (username) {
            if (!isBackendActive) return;
            try {
                await fetch(API_BASE + '/api/accounts/' + encodeURIComponent(username), {
                    method: 'DELETE',
                    headers: getHeaders()
                });
            } catch (e) { }
        },

        syncAccountsFromBackend: async function () {
            const remote = await this.loadAccounts();
            if (remote && Array.isArray(remote)) {
                let local = [];
                try {
                    const raw = localStorage.getItem('app_accounts');
                    if (raw) local = JSON.parse(raw);
                } catch (e) { }
                if (!Array.isArray(local)) local = [];

                const merged = [...local];
                remote.forEach(ra => {
                    const u = ((ra && ra.username) || '').trim().toLowerCase();
                    if (u && !merged.some(m => ((m && m.username) || '').trim().toLowerCase() === u)) {
                        merged.push(ra);
                    }
                });

                // Push any existing local accounts to cloud
                local.forEach(la => {
                    const u = ((la && la.username) || '').trim().toLowerCase();
                    if (u && !remote.some(r => ((r && r.username) || '').trim().toLowerCase() === u)) {
                        this.saveAccount(la.username);
                    }
                });

                localStorage.setItem('app_accounts', JSON.stringify(merged));
                if (typeof window.renderChips === 'function') {
                    window.renderChips();
                }
            }
        },

        // ── User Data API ──
        get: async function (key) {
            const u = getActiveUser();
            const prefix = `u:${u}:`;
            // Check local cache first
            const cached = localStorage.getItem(prefix + key);
            if (cached !== null && cached !== undefined) return cached;

            if (!isBackendActive || !u) return null;
            try {
                const res = await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/' + encodeURIComponent(key), {
                    headers: getHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.value !== null && data.value !== undefined) {
                        const strVal = typeof data.value === 'object' ? JSON.stringify(data.value) : String(data.value);
                        localStorage.setItem(prefix + key, strVal);
                        return strVal;
                    }
                }
            } catch (e) { }
            return null;
        },

        set: async function (key, value) {
            const u = getActiveUser();
            if (!u) return;

            // Always update local cache immediately
            const prefix = `u:${u}:`;
            const strVal = typeof value === 'object' ? JSON.stringify(value) : String(value);
            localStorage.setItem(prefix + key, strVal);

            if (!isBackendActive || !isDbConnected) return;

            try {
                let parsedVal = value;
                if (typeof value === 'string') {
                    try { parsedVal = JSON.parse(value); } catch (e) { parsedVal = value; }
                }
                await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/' + encodeURIComponent(key), {
                    method: 'POST',
                    headers: getHeaders(),
                    body: JSON.stringify({ value: parsedVal })
                });
            } catch (e) { }
        },

        remove: async function (key) {
            const u = getActiveUser();
            if (!u) return;

            const prefix = `u:${u}:`;
            localStorage.removeItem(prefix + key);

            if (!isBackendActive || !isDbConnected) return;
            try {
                await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/' + encodeURIComponent(key), {
                    method: 'DELETE',
                    headers: getHeaders()
                });
            } catch (e) { }
        },

        getAllKeys: async function () {
            const u = getActiveUser();
            const prefix = `u:${u}:`;
            const keySet = new Set();

            // 1. Gather all local keys
            for (let i = 0; i < localStorage.length; i++) {
                const lk = localStorage.key(i);
                if (lk && lk.startsWith(prefix)) {
                    keySet.add(lk.slice(prefix.length));
                }
            }

            // 2. If online, merge with server keys list
            if (isBackendActive && isDbConnected && u) {
                try {
                    const res = await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/keys', {
                        headers: getHeaders()
                    });
                    if (res.ok) {
                        const json = await res.json();
                        if (json.success && Array.isArray(json.keys)) {
                            json.keys.forEach(k => keySet.add(k));
                        }
                    }
                } catch (e) { }
            }

            return Array.from(keySet);
        },

        // Full cloud sync: loads all user data into local cache & migrates un-synced local data
        syncUserDataFromBackend: async function () {
            const u = getActiveUser();
            if (!isBackendActive || !isDbConnected || !u) return;

            try {
                const res = await fetch(API_BASE + '/api/data/' + encodeURIComponent(u), {
                    headers: getHeaders()
                });
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.data) {
                        const prefix = `u:${u}:`;
                        const remoteData = data.data;

                        // Save remote keys into local cache
                        Object.keys(remoteData).forEach(k => {
                            const val = remoteData[k];
                            const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                            localStorage.setItem(prefix + k, strVal);
                        });

                        // Preserve & Migrate: Push any existing local keys to cloud database
                        const payloadToPush = {};
                        for (let i = 0; i < localStorage.length; i++) {
                            const lk = localStorage.key(i);
                            if (lk && lk.startsWith(prefix)) {
                                const bareKey = lk.slice(prefix.length);
                                if (!(bareKey in remoteData)) {
                                    const rawVal = localStorage.getItem(lk);
                                    try {
                                        payloadToPush[bareKey] = JSON.parse(rawVal);
                                    } catch (e) {
                                        payloadToPush[bareKey] = rawVal;
                                    }
                                }
                            }
                        }

                        // Also check legacy un-prefixed keys for Valam or active user
                        if (u === 'valam') {
                            for (let i = 0; i < localStorage.length; i++) {
                                const lk = localStorage.key(i);
                                if (lk && (lk.startsWith('khata:') || lk.startsWith('accounting_') || lk.startsWith('active_') || lk.startsWith('global_company_name'))) {
                                    if (!(lk in remoteData)) {
                                        const rawVal = localStorage.getItem(lk);
                                        try { payloadToPush[lk] = JSON.parse(rawVal); } catch (e) { payloadToPush[lk] = rawVal; }
                                    }
                                }
                            }
                        }

                        if (Object.keys(payloadToPush).length > 0) {
                            await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/batch', {
                                method: 'POST',
                                headers: getHeaders(),
                                body: JSON.stringify({ items: payloadToPush })
                            }).catch(() => { });
                        }

                        if (data.serverTime) lastSyncTime = data.serverTime;
                        this.notifySyncListeners(Object.keys(remoteData));
                    }
                }
            } catch (e) { }
        }
    };

    // Auto-init on script load
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AppAPI.init());
    } else {
        AppAPI.init();
    }

    window.AppAPI = AppAPI;

})(window);
