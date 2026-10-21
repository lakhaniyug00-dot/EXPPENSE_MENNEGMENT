/**
 * AppAPI - Cloud Synchronization & 1-Click Multi-Account Engine
 * Features:
 *  - 1-Click Multi-Account switcher with instant isolated cloud sync
 *  - Premium avatar chip widget matching exact [V] Valam design from pipeline app
 *  - Real-time MongoDB Atlas & Fallback Cloud Synchronization
 *  - Zero password roadblock for seamless daily bookkeeping
 */
(function (window) {
    'use strict';

    // Base API URL
    const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
        && window.location.port !== '5000'
        && window.location.port !== ''
        ? (window.location.protocol + '//' + window.location.hostname + ':5000')
        : '';

    const TOKEN_KEY = 'auth_token';
    const USER_KEY = 'auth_user';
    const USER_NAME_KEY = 'auth_user_name';
    const ACCOUNTS_KEY = 'app_accounts';
    const DEVICE_ID_KEY = 'expense_device_id';

    const AVATAR_COLORS = ['#0F172A', '#D97706', '#2563EB', '#7C3AED', '#059669', '#DB2777', '#DC2626', '#0891B2'];

    // Generate or retrieve persistent unique device ID
    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        deviceId = 'dev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
        try { localStorage.setItem(DEVICE_ID_KEY, deviceId); } catch (e) { }
    }

    let isBackendActive = false;
    let isDbConnected = false;
    let isConfigured = false;
    let isSyncing = false;
    let lastSyncTime = null;
    let syncInterval = null;
    let manageMode = false;

    const syncListeners = [];
    let initPromiseResolve = null;
    const initPromise = new Promise(resolve => {
        initPromiseResolve = resolve;
    });

    function capitalize(s) {
        if (!s) return '';
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function getAuthToken() {
        return localStorage.getItem(TOKEN_KEY) || '';
    }

    function getActiveUser() {
        let u = (localStorage.getItem(USER_KEY) || '').trim().toLowerCase();
        if (!u || u === 'yug' || u === 'vipul') {
            u = 'valam';
            localStorage.setItem(USER_KEY, 'valam');
            localStorage.setItem(USER_NAME_KEY, 'Valam');
        }
        return u;
    }

    function getHeaders(extraHeaders) {
        const headers = { 'Content-Type': 'application/json' };
        const token = getAuthToken();
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const u = getActiveUser();
        if (u) headers['X-Auth-User'] = u;
        return Object.assign(headers, extraHeaders || {});
    }

    // Floating notification toast
    function showNotificationToast(msg, isError = false) {
        let toast = document.getElementById('pipeline-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'pipeline-toast';
            toast.style.cssText = 'position:fixed; bottom:24px; right:24px; background:#0F172A; color:#fff; padding:12px 20px; border-radius:12px; font-family:"Inter", -apple-system, sans-serif; font-size:14.5px; font-weight:600; box-shadow:0 10px 25px rgba(0,0,0,0.25); z-index:999999; display:none; transition:all 0.25s ease; border:1px solid rgba(255,255,255,0.15);';
            document.body.appendChild(toast);
        }
        toast.style.background = isError ? '#b3261e' : '#0F172A';
        toast.textContent = msg;
        toast.style.display = 'block';
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.style.display = 'none', 250);
        }, 3000);
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

        // Update status pill badge across headers
        updateStatusBadge: function (status, customText) {
            const badges = document.querySelectorAll('#cloud-sync-badge, .cloud-sync-badge, #backendStatusBadge');
            badges.forEach(b => {
                let dotColor = '#10b981';
                let bg = 'rgba(26,58,138,0.06)';
                let border = 'rgba(26,58,138,0.15)';
                let textColor = '#1a3a8a';
                let text = customText || 'Cloud Synced';

                if (status === 'syncing') {
                    dotColor = '#3b82f6';
                    text = customText || 'Syncing...';
                } else if (status === 'synced' || (isBackendActive && isDbConnected)) {
                    dotColor = '#10b981';
                    text = customText || 'Cloud Synced';
                } else if (status === 'offline' || !isBackendActive || !isDbConnected) {
                    dotColor = '#f59e0b';
                    bg = 'rgba(245, 158, 11, 0.1)';
                    border = '#fcd34d';
                    textColor = '#92400e';
                    text = customText || 'Offline (Local Only)';
                }

                b.style.background = bg;
                b.style.borderColor = border;
                b.style.color = textColor;
                b.style.padding = '6px 14px';
                b.style.borderRadius = '999px';
                b.style.display = 'inline-flex';
                b.style.alignItems = 'center';
                b.style.fontFamily = "'Inter', -apple-system, sans-serif";
                b.style.fontSize = '13.5px';
                b.style.fontWeight = '600';
                b.innerHTML = '<span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:' + dotColor + '; margin-right:7px; ' + (status === 'syncing' ? 'animation: livePulse 1s infinite;' : '') + '"></span><span>' + text + '</span>';
            });
        },

        // ── 1-CLICK MULTI-ACCOUNT MANAGEMENT ──
        loadAccounts: async function () {
            let accounts = [];
            // 1. Try remote
            if (isBackendActive) {
                try {
                    const res = await fetch(API_BASE + '/api/auth/accounts', { headers: getHeaders() });
                    if (res.ok) {
                        const data = await res.json();
                        if (data && data.success && Array.isArray(data.accounts)) {
                            accounts = data.accounts;
                        }
                    }
                } catch (e) { }

                if (!accounts.length) {
                    try {
                        const res = await fetch(API_BASE + '/api/accounts', { headers: getHeaders() });
                        if (res.ok) {
                            const data = await res.json();
                            if (data && data.success && Array.isArray(data.accounts)) {
                                accounts = data.accounts;
                            }
                        }
                    } catch (e) { }
                }
            }

            // 2. Read local
            let local = [];
            try {
                const raw = localStorage.getItem(ACCOUNTS_KEY);
                if (raw) local = JSON.parse(raw);
            } catch (e) { }
            if (!Array.isArray(local)) local = [];

            // Merge
            const merged = [...accounts];
            local.forEach(l => {
                const uname = (l.username || '').toLowerCase();
                if (uname && !merged.some(m => (m.username || '').toLowerCase() === uname)) {
                    merged.push(l);
                }
            });

            // Ensure Valam always exists
            if (!merged.some(a => (a.username || '').toLowerCase() === 'valam')) {
                merged.unshift({ username: 'valam' });
            }

            try { localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(merged)); } catch (e) { }
            return merged;
        },

        // Instant 1-click select account without passwords
        selectAccount: async function (rawUname, notifyToast = true) {
            const username = (rawUname || '').trim();
            if (!username) return;

            this.updateStatusBadge('syncing', 'Switching to ' + capitalize(username) + '...');

            try {
                const res = await fetch(API_BASE + '/api/auth/select', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username: username })
                });

                if (res.ok) {
                    const data = await res.json();
                    if (data && data.success) {
                        if (data.token) localStorage.setItem(TOKEN_KEY, data.token);
                        const userUname = (data.user && data.user.username) ? data.user.username : username.toLowerCase();
                        const dispName = (data.user && data.user.displayName) ? data.user.displayName : capitalize(username);
                        localStorage.setItem(USER_KEY, userUname);
                        localStorage.setItem(USER_NAME_KEY, dispName);

                        // Save to accounts list
                        const list = await this.loadAccounts();
                        if (!list.some(a => (a.username || '').toLowerCase() === userUname)) {
                            list.push({ username: userUname });
                            localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
                        }

                        this.updateUi();
                        if (notifyToast) showNotificationToast('⚡ Switched to account: ' + dispName);

                        // Sync cloud data for this newly selected user
                        await this.syncUserDataFromBackend();
                        this.updateStatusBadge('synced', 'Cloud Synced');

                        // Broadcast to other tabs & notify listeners
                        try {
                            const bc = new BroadcastChannel('khata_sync');
                            bc.postMessage({ type: 'user-switched', user: userUname });
                        } catch (e) { }

                        // Trigger smooth view refresh
                        setTimeout(() => {
                            window.location.reload();
                        }, 400);

                        return data;
                    }
                }
            } catch (err) {
                console.warn('[AppAPI] Server account switch fallback to local mode:', err.message);
            }

            // Local fallback if offline
            const clean = username.toLowerCase();
            const disp = capitalize(username);
            localStorage.setItem(USER_KEY, clean);
            localStorage.setItem(USER_NAME_KEY, disp);

            const list = await this.loadAccounts();
            if (!list.some(a => (a.username || '').toLowerCase() === clean)) {
                list.push({ username: clean });
                localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
            }

            this.updateUi();
            this.updateStatusBadge('offline', 'Local Profile: ' + disp);
            if (notifyToast) showNotificationToast('⚡ Switched to ' + disp + ' (Local)');

            setTimeout(() => {
                window.location.reload();
            }, 400);
        },

        deleteAccount: async function (username) {
            const lower = (username || '').trim().toLowerCase();
            if (lower === 'valam') {
                showNotificationToast('Default account "Valam" cannot be deleted.', true);
                return;
            }

            if (isBackendActive) {
                try {
                    await fetch(API_BASE + '/api/auth/accounts/' + encodeURIComponent(lower), {
                        method: 'DELETE',
                        headers: getHeaders()
                    });
                } catch (e) { }
            }

            let accounts = await this.loadAccounts();
            accounts = accounts.filter(a => (a.username || '').toLowerCase() !== lower);
            localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));

            // Clean local keys for deleted user
            const prefix = `u:${lower}:`;
            const toRemove = [];
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k && k.startsWith(prefix)) toRemove.push(k);
            }
            toRemove.forEach(k => localStorage.removeItem(k));

            showNotificationToast('Account "' + capitalize(lower) + '" deleted.');

            // If current user was deleted, switch to Valam
            if (getActiveUser() === lower) {
                await this.selectAccount('valam', false);
            }
        },

        forceSync: async function () {
            showNotificationToast('🔄 Syncing with cloud...');
            this.updateStatusBadge('syncing', 'Syncing...');
            await this.syncUserDataFromBackend();
            this.updateStatusBadge('synced', 'Cloud Synced');
            showNotificationToast('✅ Cloud sync complete!');
        },

        // Legacy compatibility
        login: async function (username) { return this.selectAccount(username); },
        register: async function (username) { return this.selectAccount(username); },
        logout: function () { openAccountModal(); },
        saveAccount: async function (username) {
            const accounts = await this.loadAccounts();
            const u = (username || '').toLowerCase();
            if (u && !accounts.some(a => (a.username || '').toLowerCase() === u)) {
                accounts.push({ username: u });
                localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
            }
        },

        // ── USER DATA CRUD ──
        get: async function (key) {
            const u = getActiveUser();
            const prefix = `u:${u}:`;
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

            for (let i = 0; i < localStorage.length; i++) {
                const lk = localStorage.key(i);
                if (lk) {
                    if (lk.startsWith(prefix)) {
                        keySet.add(lk.slice(prefix.length));
                    } else if (u === 'valam' && (lk.startsWith('khata:') || lk.startsWith('accounting_') || lk.startsWith('khata_pagar_data'))) {
                        keySet.add(lk);
                    }
                }
            }

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

        // Full cloud sync: loads user data into local cache & migrates un-synced data
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

                        // Preserve & Push any existing local keys to cloud
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

                        // Also check unprefixed legacy keys for Valam
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
        },

        startPeriodicSync: function () {
            if (syncInterval) clearInterval(syncInterval);
            // Polling every 8 seconds
            syncInterval = setInterval(() => {
                this.pollSync();
            }, 8000);

            // Instant sync on window focus or wake-up
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
            if (!isBackendActive || !isDbConnected || !u || isSyncing) return;

            try {
                isSyncing = true;
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
                            this.updateStatusBadge('synced', 'Synced across devices');
                        }
                        if (json.serverTime) lastSyncTime = json.serverTime;
                    }
                }
            } catch (e) {
            } finally {
                isSyncing = false;
            }
        },

        // ── UI RENDERING & INJECTION ──
        updateUi: function () {
            const activeUname = getActiveUser();
            const displayName = capitalize(activeUname);
            const initial = displayName.charAt(0).toUpperCase();

            // Update Header User Chip
            const chipName = document.getElementById('user-chip-name');
            const chipAvatar = document.getElementById('user-chip-avatar');
            if (chipName) chipName.textContent = displayName;
            if (chipAvatar) chipAvatar.textContent = initial;

            const authNameEl = document.getElementById('authUserName');
            if (authNameEl) authNameEl.textContent = displayName;

            if (isBackendActive) {
                this.updateStatusBadge(isDbConnected ? 'synced' : 'offline');
            }
        },

        init: async function () {
            // Auto ensure Valam is set if no user
            getActiveUser();

            // Render modal and widget
            renderAccountWidget();
            renderAccountModal();
            this.updateUi();

            // Health check
            try {
                const res = await fetch(API_BASE + '/api/health', {
                    method: 'GET',
                    headers: { 'Cache-Control': 'no-cache' }
                });

                if (res.ok) {
                    const data = await res.json().catch(() => ({}));
                    isBackendActive = true;
                    isDbConnected = data.database === 'connected' || data.database === 'fallback_cloud_ready';
                    isConfigured = Boolean(data.configured);

                    this.updateStatusBadge(isDbConnected ? 'synced' : 'offline', isDbConnected ? 'Cloud Synced' : 'Offline (Local Only)');

                    if (isDbConnected) {
                        await this.syncUserDataFromBackend();
                        this.startPeriodicSync();
                    }
                } else {
                    isBackendActive = false;
                    isDbConnected = false;
                    this.updateStatusBadge('offline', 'Offline (Local Only)');
                }
            } catch (err) {
                console.warn('[AppAPI] Health check error:', err);
                isBackendActive = false;
                isDbConnected = false;
                this.updateStatusBadge('offline', 'Offline (Local Only)');
            } finally {
                if (initPromiseResolve) {
                    initPromiseResolve(true);
                }
            }
        }
    };

    // ── ACCOUNT WIDGET & MODAL INJECTION ──
    function renderAccountWidget() {
        const activeUname = getActiveUser();
        const displayName = capitalize(activeUname);
        const initial = displayName.charAt(0).toUpperCase();

        // 1. If an explicit container exists in HTML, bind to it
        let container = document.getElementById('cloud-account-bar');

        if (!container) {
            // Check if page header has an action right container
            const headerRight = document.querySelector('.header-right') || document.querySelector('.top-right');
            if (headerRight) {
                container = document.createElement('div');
                container.id = 'cloud-account-bar';
                container.className = 'no-print';
                container.style.cssText = 'display:flex; align-items:center; gap:10px; margin-left:8px;';
                headerRight.appendChild(container);
            }
        }

        if (container && !document.getElementById('account-user-chip')) {
            container.innerHTML = `
                <div id="cloud-sync-badge" class="cloud-sync-badge" style="display:flex; align-items:center; background:rgba(26,58,138,0.06); border:1px solid rgba(26,58,138,0.15); padding:6px 14px; border-radius:999px; color:#1a3a8a; font-size:13.5px; font-weight:600; font-family:'Inter', sans-serif;">
                    <span style="display:inline-block; width:8px; height:8px; border-radius:50%; background:#10b981; margin-right:7px;"></span>
                    <span>Cloud Synced</span>
                </div>
                <div id="account-actions" style="display:flex; align-items:center; gap:8px;">
                    <div id="account-user-chip" title="Click to switch account / ખાતું બદલો" style="display:flex; align-items:center; gap:9px; background:#fff; border:1.5px solid #cbd5e1; border-radius:12px; padding:5px 14px; box-shadow:0 2px 6px rgba(0,0,0,0.05); cursor:pointer; user-select:none; transition:all 0.15s ease;">
                        <div id="user-chip-avatar" style="width:26px; height:26px; border-radius:7px; background:#0F172A; color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Inter', sans-serif; font-size:13px; font-weight:800; flex-shrink:0;">${escapeHtml(initial)}</div>
                        <span id="user-chip-name" style="font-family:'Inter', -apple-system, sans-serif; font-size:14.5px; font-weight:700; color:#0F172A; letter-spacing:0.2px;">${escapeHtml(displayName)}</span>
                    </div>
                    <button id="account-switch-btn" type="button" title="Switch Account / ખાતું બદલો" style="background:#e3f3ff; border:1.5px solid #1a3a8a; border-radius:999px; padding:5px 14px; cursor:pointer; color:#1a3a8a; font-family:'Inter', sans-serif; font-size:14px; font-weight:600; display:inline-flex; align-items:center; gap:5px; transition:all 0.15s ease;">👥 Switch</button>
                    <button id="account-sync-btn" type="button" title="Force Sync Now" style="background:#fff; border:1.5px solid #1a3a8a; border-radius:999px; padding:5px 12px; cursor:pointer; color:#1a3a8a; font-family:'Inter', sans-serif; font-size:14px; font-weight:600; display:inline-flex; align-items:center; gap:4px; transition:all 0.15s ease;">🔄 Sync</button>
                </div>
            `;
        }

        // Attach listeners
        document.getElementById('account-user-chip')?.addEventListener('click', openAccountModal);
        document.getElementById('account-switch-btn')?.addEventListener('click', openAccountModal);
        document.getElementById('account-sync-btn')?.addEventListener('click', () => AppAPI.forceSync());
    }

    function renderAccountModal() {
        if (document.getElementById('account-modal-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'account-modal-overlay';
        overlay.style.cssText = 'position:fixed; inset:0; background:rgba(15, 23, 42, 0.65); backdrop-filter:blur(4px); z-index:100000; display:none; align-items:center; justify-content:center; padding:16px;';

        overlay.innerHTML = `
            <div style="background:#FFFDF5; border:2px solid #1a3a8a; border-radius:20px; box-shadow:0 16px 40px rgba(0,0,0,0.25); width:100%; max-width:440px; padding:24px 22px; position:relative; font-family:'Inter', -apple-system, sans-serif;">
                <button id="modal-close-btn" style="position:absolute; top:14px; right:18px; background:none; border:none; font-size:24px; cursor:pointer; color:#1a3a8a; line-height:1;">✕</button>
                <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; padding-right:24px;">
                    <div>
                        <div style="font-size:24px; font-weight:800; color:#1a3a8a; line-height:1.1; letter-spacing:-0.3px;">Select Account</div>
                        <div style="font-size:13px; color:#5a5030; font-weight:500; margin-top:2px;">ઝડપી લૉગિન / 1-Click Multi-Account</div>
                    </div>
                    <div style="display:flex; gap:6px;">
                        <button id="modal-btn-add" type="button" style="background:#e8f9ef; border:1.5px solid #10b981; color:#0f766e; border-radius:8px; padding:5px 12px; font-size:13px; font-weight:700; cursor:pointer;">＋ Add</button>
                        <button id="modal-btn-manage" type="button" style="background:#fff; border:1.5px solid #cbd5e1; color:#1a3a8a; border-radius:8px; padding:5px 12px; font-size:13px; font-weight:700; cursor:pointer;">✏️ Manage</button>
                    </div>
                </div>

                <div id="modal-add-panel" style="display:none; background:#f5eed8; border:1.5px solid #d9c98a; border-radius:12px; padding:12px; margin-bottom:14px;">
                    <label style="font-size:13px; font-weight:700; color:#1a3a8a; display:block; margin-bottom:6px;">New Account Name / નામ</label>
                    <div style="display:flex; gap:8px;">
                        <input type="text" id="modal-add-input" placeholder="e.g. tapugi" autocomplete="off" style="flex:1; padding:9px 12px; border:1.5px solid #c9b97b; border-radius:8px; font-size:14px; font-weight:600; outline:none; background:#fff; color:#1a3a8a;" />
                        <button id="modal-add-save-btn" type="button" style="background:#1a3a8a; color:#fff; border:none; border-radius:8px; padding:9px 14px; font-size:13.5px; font-weight:700; cursor:pointer;">💾 Save</button>
                    </div>
                </div>

                <div id="modal-alert" style="display:none; padding:8px 12px; border-radius:8px; font-size:13px; font-weight:600; margin-bottom:12px;"></div>

                <div id="modal-accounts-grid" style="display:grid; grid-template-columns:1fr 1fr; gap:10px; max-height:280px; overflow-y:auto; padding:2px;"></div>

                <div style="margin-top:16px; padding-top:12px; border-top:1px dashed #d9c98a; font-size:12.5px; color:#6b5d2a; text-align:center;">
                    🔒 Isolated workspace &amp; real-time sync for each account across all devices.
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        document.getElementById('modal-close-btn').addEventListener('click', closeAccountModal);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeAccountModal(); });

        const btnAdd = document.getElementById('modal-btn-add');
        const addPanel = document.getElementById('modal-add-panel');
        const inputNew = document.getElementById('modal-add-input');
        const btnSave = document.getElementById('modal-add-save-btn');
        const btnManage = document.getElementById('modal-btn-manage');

        btnAdd.addEventListener('click', () => {
            if (addPanel.style.display === 'none') {
                addPanel.style.display = 'block';
                inputNew.focus();
            } else {
                addPanel.style.display = 'none';
            }
        });

        btnManage.addEventListener('click', () => {
            manageMode = !manageMode;
            btnManage.textContent = manageMode ? '✓ Done' : '✏️ Manage';
            btnManage.style.background = manageMode ? '#fee2e2' : '#fff';
            btnManage.style.borderColor = manageMode ? '#ef4444' : '#cbd5e1';
            btnManage.style.color = manageMode ? '#b3261e' : '#1a3a8a';
            renderModalChips();
        });

        async function handleSaveNew() {
            const raw = (inputNew.value || '').trim();
            if (!raw) {
                showModalAlert('Please enter an account name', true);
                return;
            }
            inputNew.value = '';
            addPanel.style.display = 'none';
            closeAccountModal();
            await AppAPI.selectAccount(raw);
        }

        btnSave.addEventListener('click', handleSaveNew);
        inputNew.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); handleSaveNew(); }
        });
    }

    function showModalAlert(msg, isErr = false) {
        const el = document.getElementById('modal-alert');
        if (!el) return;
        el.textContent = msg;
        el.style.background = isErr ? '#fee2e2' : '#ecfdf5';
        el.style.color = isErr ? '#b3261e' : '#065f46';
        el.style.border = '1px solid ' + (isErr ? '#fca5a5' : '#6ee7b7');
        el.style.display = 'block';
        setTimeout(() => el.style.display = 'none', 3000);
    }

    async function renderModalChips() {
        const grid = document.getElementById('modal-accounts-grid');
        if (!grid) return;

        grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#5a5030; padding:14px; font-size:13.5px;">Loading accounts...</div>';
        const accounts = await AppAPI.loadAccounts();
        grid.innerHTML = '';

        if (!accounts.length) {
            grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#5a5030; padding:14px; font-size:13.5px;">No accounts yet. Click ＋ Add to create one.</div>';
            return;
        }

        const activeUname = getActiveUser();

        accounts.forEach((acc, idx) => {
            const uname = (acc.username || '').toLowerCase();
            const displayName = capitalize(uname);
            const isCurrent = uname === activeUname;
            const initial = displayName.charAt(0).toUpperCase();
            const color = AVATAR_COLORS[idx % AVATAR_COLORS.length];

            const chip = document.createElement('div');
            chip.className = 'user-modal-chip';
            chip.style.cssText = 'background:' + (isCurrent ? '#eff6ff' : '#fff') + '; border:1.5px solid ' + (isCurrent ? '#2563eb' : '#d9c98a') + '; border-radius:12px; padding:10px 12px; display:flex; align-items:center; gap:10px; cursor:pointer; position:relative; transition:all 0.15s ease; box-shadow:0 2px 6px rgba(40,30,10,0.06); user-select:none;';

            chip.innerHTML = `
                <div style="width:32px; height:32px; border-radius:8px; background:${color}; color:#fff; display:flex; align-items:center; justify-content:center; font-family:'Inter', sans-serif; font-size:14px; font-weight:800; flex-shrink:0;">${escapeHtml(initial)}</div>
                <div style="flex:1; min-width:0;">
                    <div style="font-family:'Inter', -apple-system, sans-serif; font-size:14.5px; font-weight:700; color:#0F172A; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(displayName)}</div>
                    ${isCurrent ? '<div style="font-size:11px; font-weight:700; color:#2563eb;">● Active</div>' : ''}
                </div>
                ${manageMode && uname !== 'valam' ? '<button class="chip-delete-btn" title="Delete account" style="position:absolute; top:4px; right:4px; width:22px; height:22px; border-radius:50%; background:#ef4444; color:#fff; border:none; cursor:pointer; font-size:12px; font-weight:800; display:flex; align-items:center; justify-content:center; line-height:1;">✕</button>' : ''}
            `;

            chip.addEventListener('click', async (e) => {
                if (e.target.closest('.chip-delete-btn')) {
                    e.stopPropagation();
                    if (confirm('Delete account "' + displayName + '" and all its data?')) {
                        await AppAPI.deleteAccount(uname);
                        renderModalChips();
                    }
                    return;
                }
                if (manageMode) return;
                closeAccountModal();
                if (uname !== activeUname) {
                    await AppAPI.selectAccount(uname);
                }
            });

            grid.appendChild(chip);
        });
    }

    function openAccountModal() {
        renderAccountModal();
        const overlay = document.getElementById('account-modal-overlay');
        if (overlay) {
            overlay.style.display = 'flex';
            renderModalChips();
        }
    }

    function closeAccountModal() {
        const overlay = document.getElementById('account-modal-overlay');
        if (overlay) overlay.style.display = 'none';
        manageMode = false;
    }

    // Expose helpers globally
    window.openAccountModal = openAccountModal;
    window.closeAccountModal = closeAccountModal;
    window.AppAPI = AppAPI;

    // Auto-init
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => AppAPI.init());
    } else {
        AppAPI.init();
    }

})(window);
