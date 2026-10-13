/**
 * Rojmel Cloud Sync Module
 * Synchronizes accounts and data across multiple PCs and mobile phones using Firebase Realtime Database.
 */
(function(window) {
    'use strict';

    const CONFIG_STORAGE_KEY = 'rojmel_firebase_config';
    let db = null;
    let isInitialized = false;
    let listeners = [];
    let accountsListeners = [];

    // Safe key encoding for Firebase (Firebase keys cannot contain ., #, $, [, ], /)
    function encodeKey(k) {
        return encodeURIComponent(String(k || '')).replace(/\./g, '%2E');
    }

    function decodeKey(k) {
        return decodeURIComponent(String(k || '').replace(/%2E/g, '.'));
    }

    // Load Firebase scripts dynamically if not present
    function loadFirebaseScripts(callback) {
        if (window.firebase && window.firebase.database) {
            callback();
            return;
        }

        function loadScript(src, next) {
            const s = document.createElement('script');
            s.src = src;
            s.onload = next;
            s.onerror = function() {
                console.warn('Failed to load script: ' + src);
            };
            document.head.appendChild(s);
        }

        loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js', function() {
            loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js', function() {
                callback();
            });
        });
    }

    // Parse config (handles raw URL or JSON config or Firebase JS snippet)
    function parseConfig(raw) {
        if (!raw) return null;
        if (typeof raw === 'object') return raw;

        const str = String(raw).trim();
        // If user just provided a database URL
        if (str.startsWith('http://') || str.startsWith('https://')) {
            return { databaseURL: str.replace(/\/+$/, '') };
        }

        // Try standard JSON
        try {
            return JSON.parse(str);
        } catch (e) {}

        // Try extracting config object from pasted JS code: const firebaseConfig = { ... };
        try {
            const match = str.match(/\{[\s\S]*databaseURL[\s\S]*\}/);
            if (match) {
                // Convert JS object literals (unquoted keys) to JSON
                const jsonText = match[0]
                    .replace(/([a-zA-Z0-9_]+)\s*:/g, '"$1":')
                    .replace(/'/g, '"')
                    .replace(/,\s*\}/g, '}');
                return JSON.parse(jsonText);
            }
        } catch (e) {}

        return null;
    }

    // Initialize Firebase
    function initFirebase(config, onReady) {
        if (!config || !config.databaseURL) {
            if (onReady) onReady(false);
            return;
        }

        loadFirebaseScripts(function() {
            try {
                if (!window.firebase.apps || !window.firebase.apps.length) {
                    window.firebase.initializeApp(config);
                }
                db = window.firebase.database();
                isInitialized = true;
                updateSyncStatusBadge();
                attachAccountsListener();
                if (onReady) onReady(true);
            } catch (err) {
                console.error('Firebase init error:', err);
                isInitialized = false;
                updateSyncStatusBadge();
                if (onReady) onReady(false, err);
            }
        });
    }

    // Listen to accounts changes from cloud in real time
    function attachAccountsListener() {
        if (!db) return;
        try {
            db.ref('app_accounts').on('value', function(snapshot) {
                const cloudAccounts = snapshot.val();
                if (Array.isArray(cloudAccounts)) {
                    // Update localStorage
                    localStorage.setItem('app_accounts', JSON.stringify(cloudAccounts));
                    // Notify any registered UI callbacks
                    accountsListeners.forEach(function(fn) {
                        try { fn(cloudAccounts); } catch(e) {}
                    });
                }
            });
        } catch (e) {
            console.error('Error listening to cloud accounts:', e);
        }
    }

    // API Object
    const CloudSync = {
        init: function() {
            const saved = localStorage.getItem(CONFIG_STORAGE_KEY);
            if (saved) {
                const cfg = parseConfig(saved);
                if (cfg) {
                    initFirebase(cfg, function(ok) {
                        if (ok) {
                            console.log('☁️ Rojmel Cloud Sync connected!');
                            CloudSync.syncAllLocalToCloud();
                        }
                    });
                }
            }
            updateSyncStatusBadge();
        },

        isConnected: function() {
            return isInitialized && db !== null;
        },

        getConfig: function() {
            return localStorage.getItem(CONFIG_STORAGE_KEY) || '';
        },

        saveConfig: function(rawConfig, onDone) {
            const parsed = parseConfig(rawConfig);
            if (!parsed || !parsed.databaseURL) {
                if (onDone) onDone(false, 'Invalid config: missing databaseURL.');
                return;
            }
            localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(parsed));
            initFirebase(parsed, function(ok, err) {
                if (ok) {
                    CloudSync.syncAllLocalToCloud();
                    if (onDone) onDone(true);
                } else {
                    if (onDone) onDone(false, err ? err.message : 'Connection failed');
                }
            });
        },

        removeConfig: function() {
            localStorage.removeItem(CONFIG_STORAGE_KEY);
            isInitialized = false;
            db = null;
            updateSyncStatusBadge();
        },

        // ACCOUNTS
        onAccountsChange: function(callback) {
            if (typeof callback === 'function') {
                accountsListeners.push(callback);
            }
        },

        saveAccountsToCloud: function(accountsList) {
            if (!db) return Promise.resolve();
            return db.ref('app_accounts').set(accountsList);
        },

        // DATA GET/SET
        get: async function(key) {
            // First return local cache immediately
            const localVal = localStorage.getItem(key);
            if (!db) return localVal;

            try {
                const snapshot = await db.ref('store/' + encodeKey(key)).once('value');
                const cloudVal = snapshot.val();
                if (cloudVal !== null && cloudVal !== undefined) {
                    const strVal = typeof cloudVal === 'string' ? cloudVal : JSON.stringify(cloudVal);
                    localStorage.setItem(key, strVal);
                    return strVal;
                }
            } catch (e) {
                console.warn('Cloud get fallback to local for:', key, e);
            }
            return localVal;
        },

        set: async function(key, value) {
            // Write local immediately
            localStorage.setItem(key, value);

            if (!db) return;
            try {
                // Store string directly in cloud
                await db.ref('store/' + encodeKey(key)).set(value);
            } catch (e) {
                console.error('Cloud set error for:', key, e);
            }
        },

        remove: async function(key) {
            localStorage.removeItem(key);
            if (!db) return;
            try {
                await db.ref('store/' + encodeKey(key)).remove();
            } catch (e) {
                console.error('Cloud remove error for:', key, e);
            }
        },

        // Push existing local data to cloud so another PC immediately sees everything
        syncAllLocalToCloud: async function() {
            if (!db) return;
            try {
                // 1. Sync accounts
                const accs = localStorage.getItem('app_accounts');
                if (accs) {
                    try {
                        const parsed = JSON.parse(accs);
                        if (Array.isArray(parsed) && parsed.length) {
                            const snap = await db.ref('app_accounts').once('value');
                            const cloudAccs = snap.val() || [];
                            // Merge
                            const map = new Map();
                            cloudAccs.forEach(function(a) { if (a && a.username) map.set(a.username.toLowerCase(), a); });
                            parsed.forEach(function(a) { if (a && a.username) map.set(a.username.toLowerCase(), a); });
                            const merged = Array.from(map.values());
                            await db.ref('app_accounts').set(merged);
                            localStorage.setItem('app_accounts', JSON.stringify(merged));
                        }
                    } catch (e) {}
                }

                // 2. Sync all keys in localStorage that relate to the app
                const updates = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k) continue;
                    if (k.startsWith('u:') || k.startsWith('khata:') || k.startsWith('pagar:')) {
                        const val = localStorage.getItem(k);
                        if (val !== null) {
                            updates['store/' + encodeKey(k)] = val;
                        }
                    }
                }
                if (Object.keys(updates).length > 0) {
                    await db.ref().update(updates);
                    console.log('☁️ Synced ' + Object.keys(updates).length + ' records to cloud.');
                }
            } catch (e) {
                console.warn('Initial cloud sync notice:', e);
            }
        },

        // Listen for live updates on data keys
        onDataChange: function(key, callback) {
            if (!db) return;
            try {
                db.ref('store/' + encodeKey(key)).on('value', function(snapshot) {
                    const val = snapshot.val();
                    if (val !== null && val !== undefined) {
                        const str = typeof val === 'string' ? val : JSON.stringify(val);
                        localStorage.setItem(key, str);
                        if (callback) callback(str);
                    }
                });
            } catch (e) {}
        },

        // UI: Open Cloud Sync Settings Modal
        openModal: function() {
            let overlay = document.getElementById('cloudSyncOverlay');
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'cloudSyncOverlay';
                overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,0.55);backdrop-filter:blur(4px);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;';
                
                const card = document.createElement('div');
                card.style.cssText = 'background:#ffffff;border-radius:18px;width:100%;max-width:480px;padding:26px 22px;box-shadow:0 25px 50px -12px rgba(0,0,0,0.25);position:relative;max-height:90vh;overflow-y:auto;font-family:system-ui,-apple-system,sans-serif;color:#0F172A;box-sizing:border-box;';
                card.innerHTML = `
                    <button id="closeCloudModal" type="button" style="position:absolute;top:14px;right:16px;background:none;border:none;font-size:22px;cursor:pointer;color:#64748B;line-height:1;">✕</button>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                        <span style="font-size:26px;">☁️</span>
                        <div>
                            <h3 style="margin:0;font-size:18px;font-weight:800;color:#0F172A;">Multi-Device Cloud Sync</h3>
                            <div style="font-size:12px;color:#64748B;">Auto-sync between PC, Phone, and other computers</div>
                        </div>
                    </div>

                    <div id="cloudStatusBox" style="margin:14px 0;padding:10px 14px;border-radius:10px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:8px;"></div>

                    <div style="margin-bottom:14px;">
                        <label style="display:block;font-size:12px;font-weight:700;color:#334155;margin-bottom:5px;">
                            Firebase Realtime Database URL or Config JSON
                        </label>
                        <textarea id="cloudConfigInput" rows="3" placeholder="https://your-project-default-rtdb.firebaseio.com" style="width:100%;padding:10px 12px;border:1.5px solid #CBD5E1;border-radius:10px;font-size:12.5px;font-family:monospace;background:#F8FAFC;outline:none;box-sizing:border-box;resize:vertical;"></textarea>
                        <div style="font-size:11.5px;color:#64748B;margin-top:4px;">
                            Paste either your <b>Database URL</b> or full Firebase config snippet.
                        </div>
                    </div>

                    <div style="display:flex;gap:8px;margin-bottom:16px;">
                        <button id="saveCloudConfigBtn" type="button" style="flex:1;padding:11px;background:#0F172A;color:#fff;border:none;border-radius:10px;font-size:13.5px;font-weight:700;cursor:pointer;">
                            Connect &amp; Sync Now
                        </button>
                        <button id="disconnectCloudBtn" type="button" style="padding:11px 14px;background:#FEE2E2;color:#DC2626;border:1px solid #FCA5A5;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;">
                            Disconnect
                        </button>
                    </div>

                    <div style="border-top:1px dashed #E2E8F0;padding-top:14px;">
                        <div style="font-size:12px;font-weight:800;color:#1E293B;margin-bottom:6px;">📖 2-Minute Setup Guide (Free):</div>
                        <ol style="font-size:12px;color:#475569;line-height:1.6;padding-left:18px;margin:0;">
                            <li>Open <a href="https://console.firebase.google.com" target="_blank" style="color:#2563EB;font-weight:700;">console.firebase.google.com</a> and click <b>Add Project</b>.</li>
                            <li>Go to <b>Build &rarr; Realtime Database</b> &rarr; Click <b>Create Database</b>.</li>
                            <li>Choose location and select <b>Start in test mode</b> (allows read/write).</li>
                            <li>Copy the <b>Database URL</b> (looks like <code>https://...firebaseio.com</code>) and paste it above!</li>
                        </ol>
                    </div>
                `;

                overlay.appendChild(card);
                overlay.addEventListener('click', function(e) {
                    if (e.target === overlay) overlay.style.display = 'none';
                });
                document.body.appendChild(overlay);

                document.getElementById('closeCloudModal').addEventListener('click', function() {
                    overlay.style.display = 'none';
                });

                document.getElementById('saveCloudConfigBtn').addEventListener('click', function() {
                    const val = document.getElementById('cloudConfigInput').value.trim();
                    if (!val) {
                        alert('Please paste your Firebase Database URL or Config.');
                        return;
                    }
                    const btn = document.getElementById('saveCloudConfigBtn');
                    btn.textContent = 'Connecting...';
                    CloudSync.saveConfig(val, function(ok, err) {
                        btn.textContent = 'Connect & Sync Now';
                        if (ok) {
                            renderModalStatus();
                            alert('✅ Connected successfully! Your accounts and data are now syncing in real-time across all PCs and phones.');
                            overlay.style.display = 'none';
                        } else {
                            alert('⚠️ Connection failed: ' + (err || 'Check your URL and permissions.'));
                        }
                    });
                });

                document.getElementById('disconnectCloudBtn').addEventListener('click', function() {
                    if (confirm('Disconnect from Cloud Sync on this device? (Local data stays safe)')) {
                        CloudSync.removeConfig();
                        renderModalStatus();
                    }
                });
            } else {
                overlay.style.display = 'flex';
            }

            renderModalStatus();
        }
    };

    function renderModalStatus() {
        const box = document.getElementById('cloudStatusBox');
        const input = document.getElementById('cloudConfigInput');
        if (!box) return;

        const currentCfg = CloudSync.getConfig();
        if (input) input.value = currentCfg;

        if (CloudSync.isConnected()) {
            box.style.background = '#ECFDF5';
            box.style.border = '1px solid #A7F3D0';
            box.style.color = '#065F46';
            box.innerHTML = '🟢 <b>Cloud Connected</b> — All accounts & data sync live with other devices!';
        } else if (currentCfg) {
            box.style.background = '#FFFBEB';
            box.style.border = '1px solid #FDE68A';
            box.style.color = '#92400E';
            box.innerHTML = '🟡 Config saved, connecting...';
        } else {
            box.style.background = '#F1F5F9';
            box.style.border = '1px solid #CBD5E1';
            box.style.color = '#475569';
            box.innerHTML = '⚪ <b>Local Only</b> — Paste your Firebase URL above to enable multi-device sync.';
        }
    }

    function updateSyncStatusBadge() {
        const badges = document.querySelectorAll('.cloud-sync-badge');
        badges.forEach(function(el) {
            if (CloudSync.isConnected()) {
                el.style.background = '#ECFDF5';
                el.style.borderColor = '#10B981';
                el.style.color = '#065F46';
                el.innerHTML = '🟢 ☁️ Synced';
                el.title = 'Cloud Sync Connected — Click for settings';
            } else {
                el.style.background = '#F8FAFC';
                el.style.borderColor = '#CBD5E1';
                el.style.color = '#64748B';
                el.innerHTML = '☁️ Cloud Sync';
                el.title = 'Click to connect Cloud Sync';
            }
        });
    }

    // Auto init on script load
    CloudSync.init();

    window.CloudSync = CloudSync;

})(window);
