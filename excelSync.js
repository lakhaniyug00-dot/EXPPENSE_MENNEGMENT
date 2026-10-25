const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const XLSX = require('xlsx');

const IS_LOCAL_WIN = process.platform === 'win32' && !process.env.VERCEL;
const EXCEL_DIR = 'C:\\Expense_Data';
const EXCEL_FILE = path.join(EXCEL_DIR, 'Expense_Management.xlsx');
const EXCEL_FALLBACK = path.join(EXCEL_DIR, 'Expense_Management_Latest.xlsx');

// Ensure directory exists on local Windows machine
if (IS_LOCAL_WIN) {
    try {
        if (!fs.existsSync(EXCEL_DIR)) {
            fs.mkdirSync(EXCEL_DIR, { recursive: true });
        }
    } catch (e) {
        console.error('[ExcelSync] Directory initialization error:', e.message);
    }
}

let syncTimeout = null;
let lastSavedTime = null;

/**
 * Schedule a debounced Excel sync
 */
function scheduleSync(UserData, username = 'valam') {
    if (syncTimeout) clearTimeout(syncTimeout);
    syncTimeout = setTimeout(() => {
        generateExcel(UserData, username).catch(err => {
            console.error('[ExcelSync] Error generating Excel:', err.message);
        });
    }, 350);
}

/**
 * Auto-fit column widths based on cell content length
 */
function autoFitColumns(rows, defaultWidth = 15) {
    if (!rows || rows.length === 0) return [];
    const keys = Object.keys(rows[0]);
    return keys.map(k => {
        let maxLen = k.length;
        rows.forEach(r => {
            const valStr = String(r[k] !== undefined && r[k] !== null ? r[k] : '');
            if (valStr.length > maxLen) maxLen = valStr.length;
        });
        return { wch: Math.min(Math.max(maxLen + 3, defaultWidth), 45) };
    });
}

/**
 * Compile dataMap dictionary into a multi-sheet XLSX workbook
 */
function buildWorkbookFromDataMap(dataMap = {}) {
    const wb = XLSX.utils.book_new();

    // ── 1. ROJMEL (DAILY ENTRIES) ──
    const rojmelRows = [];
    const dayKeys = Object.keys(dataMap)
        .filter(k => k.startsWith('khata:day:'))
        .sort((a, b) => b.localeCompare(a)); // Newest dates first

    dayKeys.forEach(k => {
        const dateStr = k.replace('khata:day:', '');
        const day = dataMap[k];
        if (!day) return;

        (day.income || []).forEach(e => {
            rojmelRows.push({
                'Date': dateStr,
                'Type': 'Aavak (Income)',
                'Name': (e.name || '').trim(),
                'Category': (e.category || '').trim(),
                'Sub Category (Master)': (e.master || '').trim(),
                'Amount (₹)': Number(e.amount) || 0,
                'Note': (e.note || '').trim(),
                'Pagar Type': (e.fixedLabel || e.pagarType || '').trim()
            });
        });

        (day.expense || []).forEach(e => {
            rojmelRows.push({
                'Date': dateStr,
                'Type': 'Javak (Expense)',
                'Name': (e.name || '').trim(),
                'Category': (e.category || '').trim(),
                'Sub Category (Master)': (e.master || '').trim(),
                'Amount (₹)': Number(e.amount) || 0,
                'Note': (e.note || '').trim(),
                'Pagar Type': (e.fixedLabel || e.pagarType || '').trim()
            });
        });
    });

    const wsRojmel = XLSX.utils.json_to_sheet(rojmelRows.length ? rojmelRows : [{ 'Info': 'No Rojmel entries yet' }]);
    if (rojmelRows.length) wsRojmel['!cols'] = autoFitColumns(rojmelRows, 14);
    XLSX.utils.book_append_sheet(wb, wsRojmel, 'Rojmel (Daily)');

    // ── 2. KHATA BOOK (ACCOUNTS & LEDGERS) ──
    const khataRows = [];
    const accounts = Array.isArray(dataMap['khata:accounts']) ? dataMap['khata:accounts'] : [];
    const accountNames = new Set();
    accounts.forEach(a => { if (a && a.name && a.name.trim()) accountNames.add(a.name.trim()); });
    if (Array.isArray(dataMap['khata:master_entries'])) {
        dataMap['khata:master_entries'].forEach(m => { if (m && m.name && m.name.trim()) accountNames.add(m.name.trim()); });
    }
    Object.keys(dataMap).forEach(k => {
        if (k.startsWith('khata:acc:')) {
            const accId = k.replace('khata:acc:', '');
            const acc = accounts.find(a => a.id === accId);
            if (acc && acc.name) accountNames.add(acc.name.trim());
        }
    });

    const sortedAccounts = Array.from(accountNames).sort((a, b) => a.localeCompare(b));
    sortedAccounts.forEach(accName => {
        const lower = accName.toLowerCase();
        const accObj = accounts.find(a => (a.name || '').trim().toLowerCase() === lower);
        const accId = accObj ? accObj.id : ('auto:' + lower);

        // Rojmel day entries for this account
        dayKeys.forEach(k => {
            const dateStr = k.replace('khata:day:', '');
            const day = dataMap[k];
            if (!day) return;
            (day.income || []).forEach(e => {
                if ((e.name || '').trim().toLowerCase() === lower) {
                    khataRows.push({
                        'Account Name': accName,
                        'Date': dateStr,
                        'Type': 'Aavak (Income)',
                        'Aavak (₹)': Number(e.amount) || 0,
                        'Javak (₹)': 0,
                        'Note': (e.note || '').trim(),
                        'Sub Category': (e.master || e.category || '').trim(),
                        'Source': 'Rojmel Daily'
                    });
                }
            });
            (day.expense || []).forEach(e => {
                if ((e.name || '').trim().toLowerCase() === lower) {
                    khataRows.push({
                        'Account Name': accName,
                        'Date': dateStr,
                        'Type': 'Javak (Expense)',
                        'Aavak (₹)': 0,
                        'Javak (₹)': Number(e.amount) || 0,
                        'Note': (e.note || '').trim(),
                        'Sub Category': (e.master || e.category || '').trim(),
                        'Source': 'Rojmel Daily'
                    });
                }
            });
        });

        // Khata manual entries for this account
        const manualEntries = dataMap['khata:acc:' + accId] || dataMap['khata:acc:auto:' + lower];
        if (Array.isArray(manualEntries)) {
            manualEntries.forEach(m => {
                if (!m) return;
                khataRows.push({
                    'Account Name': accName,
                    'Date': m.date || '',
                    'Type': (m.aavak > 0) ? 'Aavak (Income)' : 'Javak (Expense)',
                    'Aavak (₹)': Number(m.aavak) || 0,
                    'Javak (₹)': Number(m.javak) || 0,
                    'Note': (m.note || '').trim(),
                    'Sub Category': (m.master || '').trim(),
                    'Source': 'Khata Manual'
                });
            });
        }
    });

    const wsKhata = XLSX.utils.json_to_sheet(khataRows.length ? khataRows : [{ 'Info': 'No Khata Book entries yet' }]);
    if (khataRows.length) wsKhata['!cols'] = autoFitColumns(khataRows, 15);
    XLSX.utils.book_append_sheet(wb, wsKhata, 'Khata Book');

    // ── 3. PAGAR - FIX WORKERS ──
    const fixPagarRows = [];
    const pagar = dataMap['khata_pagar_data'] || dataMap['khata_pagar_data_2026'] || {};
    const fixSlips = Array.isArray(pagar.fixSlipsData) ? pagar.fixSlipsData : [];
    fixSlips.forEach((slip, idx) => {
        if (!slip || !slip.name || slip.name.startsWith('Fix Worker #')) return;
        const salary = Number(slip.salary) || 0;
        const days = Number(slip.days) || 30;
        let dutiesTotal = 0;
        (slip.duties || []).forEach(d => { dutiesTotal += Number(d.val) || 0; });
        const earned = days > 0 ? Math.round((salary / days) * dutiesTotal) : 0;
        let upadTotal = 0;
        (slip.upad || []).forEach(u => { upadTotal += Number(u.amt) || 0; });
        const netPayable = earned - upadTotal;

        fixPagarRows.push({
            'Slip No': slip.slipNo || (idx + 1),
            'Worker Name': slip.name.trim(),
            'Month': slip.month || '',
            'Monthly Salary (₹)': salary,
            'Present Duties': dutiesTotal,
            'Gross Salary (₹)': earned,
            'Upad Taken (₹)': upadTotal,
            'Net Payable (₹)': netPayable
        });
    });

    const wsFixPagar = XLSX.utils.json_to_sheet(fixPagarRows.length ? fixPagarRows : [{ 'Info': 'No Fix Worker slips' }]);
    if (fixPagarRows.length) wsFixPagar['!cols'] = autoFitColumns(fixPagarRows, 14);
    XLSX.utils.book_append_sheet(wb, wsFixPagar, 'Pagar - Fix Workers');

    // ── 4. PAGAR - DAILY OPERATORS ──
    const opPagarRows = [];
    const opSlips = Array.isArray(pagar.opSlipsData) ? pagar.opSlipsData : [];
    opSlips.forEach((slip, idx) => {
        if (!slip || !slip.name || slip.name.startsWith('Operator #')) return;
        let dutiesTotal = 0;
        (slip.duties || []).forEach(d => { dutiesTotal += Number(d.val) || 0; });
        let rate = 0;
        if (Array.isArray(pagar.ratesData) && pagar.ratesData[idx]) {
            rate = Number(pagar.ratesData[idx].rate) || 0;
        }
        const earned = Math.round(dutiesTotal * rate);
        let upadTotal = 0;
        (slip.upad || []).forEach(u => { upadTotal += Number(u.amt) || 0; });
        const netPayable = earned - upadTotal;

        opPagarRows.push({
            'Slip No': slip.slipNo || (idx + 1),
            'Operator Name': slip.name.trim(),
            'Month': slip.month || '',
            'Rate (₹)': rate,
            'Total Duties': dutiesTotal,
            'Gross Earned (₹)': earned,
            'Upad Taken (₹)': upadTotal,
            'Net Payable (₹)': netPayable
        });
    });

    const wsOpPagar = XLSX.utils.json_to_sheet(opPagarRows.length ? opPagarRows : [{ 'Info': 'No Operator slips' }]);
    if (opPagarRows.length) wsOpPagar['!cols'] = autoFitColumns(opPagarRows, 14);
    XLSX.utils.book_append_sheet(wb, wsOpPagar, 'Pagar - Daily Operators');

    // ── 5. MASTER ENTRIES LIST ──
    const masterRows = [];
    const masters = Array.isArray(dataMap['khata:master_entries']) ? dataMap['khata:master_entries'] : [];
    masters.forEach(m => {
        if (!m || !m.name) return;
        masterRows.push({
            'Name': (m.name || '').trim(),
            'Category': (m.category || '').trim(),
            'Sub Category / Master': (m.master || '').trim(),
            'Pagar Type': (m.pagarType || m.fixedLabel || '').trim(),
            'Salary / Rate (₹)': Number(m.amount || m.pagarAmount) || 0,
            'Note': (m.note || '').trim()
        });
    });

    const wsMasters = XLSX.utils.json_to_sheet(masterRows.length ? masterRows : [{ 'Info': 'No Master entries' }]);
    if (masterRows.length) wsMasters['!cols'] = autoFitColumns(masterRows, 15);
    XLSX.utils.book_append_sheet(wb, wsMasters, 'Master List');

    return wb;
}

/**
 * Compile MongoDB data into a multi-sheet Excel file.
 * Saves to C:\Expense_Data\ on local Windows, or returns workbook for download on Cloud.
 */
async function generateExcel(UserDataOrMap, username = 'valam') {
    const u = (username || 'valam').trim().toLowerCase();
    let dataMap = {};

    if (UserDataOrMap && typeof UserDataOrMap.find === 'function') {
        // Mongoose Model
        const records = await UserDataOrMap.find({ username: u }).lean();
        if (records && records.length) {
            records.forEach(r => { dataMap[r.key] = r.value; });
        }
    } else if (Array.isArray(UserDataOrMap)) {
        // Records array
        UserDataOrMap.forEach(r => { dataMap[r.key] = r.value; });
    } else if (UserDataOrMap && typeof UserDataOrMap === 'object') {
        // Already a dataMap dictionary
        dataMap = UserDataOrMap;
    }

    const wb = buildWorkbookFromDataMap(dataMap);

    // If on Cloud (Vercel) or not Windows, do not attempt local filesystem write
    if (!IS_LOCAL_WIN) {
        lastSavedTime = new Date().toISOString();
        return { success: true, isLocal: false, time: lastSavedTime, wb };
    }

    // ── WRITE FILE TO C:\Expense_Data (Local Windows only) ──
    try {
        XLSX.writeFile(wb, EXCEL_FILE);
        lastSavedTime = new Date().toISOString();
        console.log(`[ExcelSync] 💾 Successfully saved to: ${EXCEL_FILE} (${new Date().toLocaleTimeString()})`);
        return { success: true, isLocal: true, file: EXCEL_FILE, time: lastSavedTime, wb };
    } catch (err) {
        // If file is open in Microsoft Excel, write to fallback file
        console.warn(`[ExcelSync] Primary file locked (likely open in Excel). Writing to fallback: ${EXCEL_FALLBACK}`);
        try {
            XLSX.writeFile(wb, EXCEL_FALLBACK);
            lastSavedTime = new Date().toISOString();
            return { success: true, isLocal: true, file: EXCEL_FALLBACK, time: lastSavedTime, warning: 'Primary file was open in Excel', wb };
        } catch (e2) {
            console.error('[ExcelSync] Critical write error:', e2.message);
            return { success: false, isLocal: true, error: e2.message, wb };
        }
    }
}

/**
 * Open C:\Expense_Data folder in Windows File Explorer
 */
function openExcelFolder() {
    return new Promise((resolve, reject) => {
        if (!IS_LOCAL_WIN) {
            return reject(new Error('Folder opening only supported on local Windows machine'));
        }
        exec(`explorer.exe "${EXCEL_DIR}"`, (err) => {
            if (err) return reject(err);
            resolve(true);
        });
    });
}

/**
 * Open the Excel file directly in default application
 */
function openExcelFile() {
    return new Promise((resolve, reject) => {
        if (!IS_LOCAL_WIN) {
            return reject(new Error('File opening only supported on local Windows machine'));
        }
        const fileToOpen = fs.existsSync(EXCEL_FILE) ? EXCEL_FILE : EXCEL_FALLBACK;
        exec(`start "" "${fileToOpen}"`, (err) => {
            if (err) return reject(err);
            resolve(true);
        });
    });
}

function getStatus() {
    const isLocal = IS_LOCAL_WIN;
    const exists = isLocal && fs.existsSync(EXCEL_FILE);
    let size = 0;
    let modified = null;
    if (exists) {
        try {
            const stats = fs.statSync(EXCEL_FILE);
            size = stats.size;
            modified = stats.mtime.toISOString();
        } catch (e) { }
    }
    return {
        isLocal,
        folder: isLocal ? EXCEL_DIR : null,
        file: isLocal ? EXCEL_FILE : null,
        exists,
        size,
        lastModified: modified || lastSavedTime
    };
}

module.exports = {
    scheduleSync,
    buildWorkbookFromDataMap,
    generateExcel,
    openExcelFolder,
    openExcelFile,
    getStatus,
    IS_LOCAL_WIN,
    EXCEL_DIR,
    EXCEL_FILE
};
