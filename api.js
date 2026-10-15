/**
 * AppAPI - Dynamic Frontend-to-Backend Bridge for MongoDB & Express
 * Automatically syncs accounts, financial years, daily rojmel, khata ledgers,
 * and payroll between the frontend and the MongoDB backend.
 */
(function (window) {
    'use strict';

    // The backend origin (same origin when served by server.js, or fallback to port 5000)
    const API_BASE = window.location.port === '5000' || !window.location.port
        ? '' 
        : (window.location.protocol + '//' + window.location.hostname + ':5000');

    let isBackendActive = false;

    const AppAPI = {
        isAvailable: function () {
            return isBackendActive;
        },

        init: async function () {
            try {
                const res = await fetch(API_BASE + '/api/health', { method: 'GET' });
                if (res.ok) {
                    const data = await res.json();
                    isBackendActive = true;
                    this.updateStatusBadge(true, data.database === 'connected');
                    // Sync initial accounts
                    await this.syncAccountsFromBackend();
                    // Sync active user data
                    await this.syncUserDataFromBackend();
                } else {
                    isBackendActive = false;
                    this.updateStatusBadge(false);
                }
            } catch (err) {
                isBackendActive = false;
                this.updateStatusBadge(false);
            }
        },

        updateStatusBadge: function (isServerUp, isDbUp) {
            const el = document.getElementById('backendStatusBadge');
            if (el) {
                if (isServerUp) {
                    el.style.background = '#ECFDF5';
                    el.style.border = '1px solid #10B981';
                    el.style.color = '#065F46';
                    el.innerHTML = isDbUp ? '🟢 Dynamic (MongoDB)' : '🟡 Server Connected';
                    el.title = 'Live Dynamic Server Connected to MongoDB database.';
                } else {
                    el.style.background = '#F8FAFC';
                    el.style.border = '1px solid #E2E8F0';
                    el.style.color = '#64748B';
                    el.innerHTML = '⚪ Local Storage';
                    el.title = 'Running in standalone local storage mode.';
                }
            }
        },

        // Accounts API
        loadAccounts: async function () {
            if (!isBackendActive) return null;
            try {
                const res = await fetch(API_BASE + '/api/accounts');
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && Array.isArray(data.accounts)) {
                        return data.accounts;
                    }
                }
            } catch (e) { }
            return null;
        },

        saveAccount: async function (username) {
            if (!isBackendActive) return;
            try {
                await fetch(API_BASE + '/api/accounts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username })
                });
            } catch (e) { }
        },

        deleteAccount: async function (username) {
            if (!isBackendActive) return;
            try {
                await fetch(API_BASE + '/api/accounts/' + encodeURIComponent(username), {
                    method: 'DELETE'
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

                // Merge preserving local
                const merged = [...local];
                remote.forEach(ra => {
                    const u = ((ra && ra.username) || '').trim().toLowerCase();
                    if (u && !merged.some(m => ((m && m.username) || '').trim().toLowerCase() === u)) {
                        merged.push(ra);
                    }
                });

                // Also push any local accounts to remote if missing
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

        // User Data API (key-value)
        get: async function (key) {
            const u = (localStorage.getItem('auth_user') || '').trim().toLowerCase();
            if (!isBackendActive || !u) return null;
            try {
                const res = await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/' + encodeURIComponent(key));
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.value !== null && data.value !== undefined) {
                        return typeof data.value === 'object' ? JSON.stringify(data.value) : String(data.value);
                    }
                }
            } catch (e) { }
            return null;
        },

        set: async function (key, value) {
            const u = (localStorage.getItem('auth_user') || '').trim().toLowerCase();
            if (!isBackendActive || !u) return;
            try {
                let parsedVal = value;
                if (typeof value === 'string') {
                    try { parsedVal = JSON.parse(value); } catch (e) { parsedVal = value; }
                }
                await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/' + encodeURIComponent(key), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ value: parsedVal })
                });
            } catch (e) { }
        },

        remove: async function (key) {
            const u = (localStorage.getItem('auth_user') || '').trim().toLowerCase();
            if (!isBackendActive || !u) return;
            try {
                await fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/' + encodeURIComponent(key), {
                    method: 'DELETE'
                });
            } catch (e) { }
        },

        syncUserDataFromBackend: async function () {
            const u = (localStorage.getItem('auth_user') || '').trim().toLowerCase();
            if (!isBackendActive || !u) return;
            try {
                const res = await fetch(API_BASE + '/api/data/' + encodeURIComponent(u));
                if (res.ok) {
                    const data = await res.json();
                    if (data.success && data.data) {
                        const prefix = `u:${u}:`;
                        const remoteData = data.data;

                        // Save all remote keys into localStorage cache
                        Object.keys(remoteData).forEach(k => {
                            const val = remoteData[k];
                            const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
                            localStorage.setItem(prefix + k, strVal);
                        });

                        // Also push any existing local keys to remote if not yet on server
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

                        if (Object.keys(payloadToPush).length > 0) {
                            fetch(API_BASE + '/api/data/' + encodeURIComponent(u) + '/batch', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ items: payloadToPush })
                            }).catch(() => { });
                        }
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
