import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  getDay, saveDay as apiSaveDay, getDays,
  getConfig, saveCategories, saveMasters, saveWorkers, saveCompanyName,
  getMasterEntries, saveMasterEntry, deleteMasterEntry, renameMaster,
} from '../api';
import { rupee, uid, toKey, fromKey, displayDate } from '../utils';
import MasterModal from '../components/MasterModal';
import SearchModal  from '../components/SearchModal';
import './Rojmel.css';

export default function Rojmel() {
  const today = new Date();

  // ── State ──
  const [currentDate, setCurrentDate]     = useState(today);
  const [dayData, setDayData]             = useState({ income: [], expense: [] });
  const [prevNetCarry, setPrevNetCarry]   = useState(null);
  const [categories, setCategories]       = useState(['Factory Karigar', 'Factory Expense']);
  const [masters, setMasters]             = useState(['Weaving', 'Dyeing', 'Finishing', 'Other']);
  const [workers, setWorkers]             = useState([]);
  const [masterEntries, setMasterEntries] = useState([]);
  const [companyName, setCompanyName]     = useState('');
  const [status, setStatus]               = useState('');
  const [statusErr, setStatusErr]         = useState(false);
  const [loading, setLoading]             = useState(true);

  const [showMaster, setShowMaster]   = useState(false);
  const [showSearch, setShowSearch]   = useState(false);
  const [allDays, setAllDays]         = useState([]);

  const statusTimer = useRef(null);

  // ── Status helper ──
  const showStatus = useCallback((msg, isErr = false) => {
    setStatus(msg); setStatusErr(isErr);
    clearTimeout(statusTimer.current);
    if (!isErr) statusTimer.current = setTimeout(() => setStatus(''), 2000);
  }, []);

  // ── Load config (categories, workers, masters, company) ──
  const loadConfig = useCallback(async () => {
    try {
      const cfg = await getConfig();
      setCategories(cfg.categories || ['Factory Karigar', 'Factory Expense']);
      setMasters(cfg.masters || ['Weaving', 'Dyeing', 'Finishing', 'Other']);
      setWorkers(cfg.workers || []);
      setCompanyName(cfg.companyName || '');
    } catch (e) { console.error('loadConfig error', e); }
  }, []);

  // ── Load master entries ──
  const loadMasterEntries = useCallback(async () => {
    try { setMasterEntries(await getMasterEntries()); } catch (e) { console.error(e); }
  }, []);

  // ── Load a specific day ──
  const loadDay = useCallback(async (date) => {
    try {
      const data = await getDay(toKey(date));
      setDayData({ income: data.income || [], expense: data.expense || [] });
    } catch (e) {
      setDayData({ income: [], expense: [] });
    }
  }, []);

  // ── Load all days for carry/search ──
  const loadAllDays = useCallback(async () => {
    try { setAllDays(await getDays()); } catch (e) { console.error(e); }
  }, []);

  // ── Compute prev net carry ──
  const computePrevNetCarry = useCallback((allDaysArr, curDate) => {
    const curKey = toKey(curDate);
    const pastDays = allDaysArr
      .filter(d => d.dateKey < curKey && (d.income?.length || d.expense?.length))
      .sort((a, b) => a.dateKey.localeCompare(b.dateKey));

    if (!pastDays.length) { setPrevNetCarry(null); return; }

    let net = 0;
    let lastDate = null;
    pastDays.forEach(d => {
      const inc = (d.income || []).reduce((s, e) => s + Number(e.amount || 0), 0);
      const exp = (d.expense || []).reduce((s, e) => s + Number(e.amount || 0), 0);
      net += (inc - exp);
      lastDate = d.dateKey;
    });

    if (lastDate) {
      const [y, m, dv] = lastDate.split('-');
      setPrevNetCarry({ amount: net, fromDate: `${dv}/${m}/${String(y).slice(-2)}` });
    } else {
      setPrevNetCarry(null);
    }
  }, []);

  // ── Save day ──
  const saveDayData = useCallback(async (newData, date) => {
    try {
      await apiSaveDay(toKey(date || currentDate), newData || dayData);
      showStatus('Saved.', false);
    } catch (e) {
      showStatus('Could not save — server error.', true);
    }
  }, [currentDate, dayData, showStatus]);

  // ── Init ──
  useEffect(() => {
    (async () => {
      setLoading(true);
      await Promise.all([loadConfig(), loadMasterEntries(), loadDay(today), loadAllDays()]);
      setLoading(false);
    })();
  }, []); // eslint-disable-line

  // ── When currentDate changes, reload day and recompute carry ──
  useEffect(() => {
    loadDay(currentDate);
  }, [currentDate, loadDay]);

  useEffect(() => {
    computePrevNetCarry(allDays, currentDate);
  }, [allDays, currentDate, computePrevNetCarry]);

  // ── Net calculation ──
  const calcNet = () => {
    const inc = dayData.income.reduce((s, e) => s + Number(e.amount || 0), 0);
    const exp = dayData.expense.reduce((s, e) => s + Number(e.amount || 0), 0);
    const carry = prevNetCarry ? prevNetCarry.amount : 0;
    return { inc: inc + carry, exp, net: (inc + carry) - exp };
  };
  const { inc, exp, net } = calcNet();

  // ── Date navigation ──
  const goToDate = (d) => setCurrentDate(new Date(d));
  const prevDay  = () => { const d = new Date(currentDate); d.setDate(d.getDate() - 1); goToDate(d); };
  const nextDay  = () => { const d = new Date(currentDate); d.setDate(d.getDate() + 1); goToDate(d); };

  // ── Delete entry ──
  const deleteEntry = async (type, id) => {
    const newData = {
      ...dayData,
      [type]: dayData[type].filter(e => e.id !== id),
    };
    setDayData(newData);
    await saveDayData(newData);
    setAllDays(prev => prev.map(d => d.dateKey === toKey(currentDate) ? { ...d, ...newData } : d));
  };

  // ── Update amount inline ──
  const updateAmount = async (type, id, amount) => {
    const newData = {
      ...dayData,
      [type]: dayData[type].map(e => e.id === id ? { ...e, amount } : e),
    };
    setDayData(newData);
    await saveDayData(newData);
    setAllDays(prev => prev.map(d => d.dateKey === toKey(currentDate) ? { ...d, ...newData } : d));
  };

  // ── Update note inline ──
  const updateNote = async (type, id, note) => {
    const newData = {
      ...dayData,
      [type]: dayData[type].map(e => e.id === id ? { ...e, note } : e),
    };
    setDayData(newData);
    await saveDayData(newData);
  };

  // ── Add entry from picker ──
  const addEntry = async (type, entry) => {
    const newEntry = { ...entry, id: uid() };
    const newData = {
      ...dayData,
      [type]: [...dayData[type], newEntry],
    };
    setDayData(newData);
    await saveDayData(newData);
    setAllDays(prev => {
      const found = prev.find(d => d.dateKey === toKey(currentDate));
      if (found) return prev.map(d => d.dateKey === toKey(currentDate) ? { ...d, ...newData } : d);
      return [...prev, { dateKey: toKey(currentDate), ...newData }];
    });
  };

  // ── Master modal callbacks ──
  const handleMasterSave = async (entry) => {
    try {
      await saveMasterEntry(entry);
      await loadMasterEntries();
      // Update workers
      if (entry.name && !workers.includes(entry.name)) {
        const newWorkers = [...workers, entry.name];
        setWorkers(newWorkers);
        await saveWorkers(newWorkers);
      }
      showStatus(`Saved master for "${entry.name}".`);
    } catch (e) {
      showStatus('Error saving master.', true);
    }
  };

  const handleMasterDelete = async (name) => {
    try {
      await deleteMasterEntry(name);
      await loadMasterEntries();
      const newWorkers = workers.filter(w => w.toLowerCase() !== name.toLowerCase());
      setWorkers(newWorkers);
      await saveWorkers(newWorkers);
      // Also remove from today's data
      const newData = {
        income:  dayData.income.filter(e => (e.name || '').toLowerCase() !== name.toLowerCase()),
        expense: dayData.expense.filter(e => (e.name || '').toLowerCase() !== name.toLowerCase()),
      };
      setDayData(newData);
      await saveDayData(newData);
      showStatus(`Deleted "${name}" from all pages.`);
    } catch (e) {
      showStatus('Error deleting.', true);
    }
  };

  const handleMasterRename = async (oldName, newName) => {
    try {
      await renameMaster(oldName, newName);
      await loadMasterEntries();
      const newWorkers = workers.map(w => w.toLowerCase() === oldName.toLowerCase() ? newName : w);
      setWorkers(newWorkers);
      await saveWorkers(newWorkers);
      // Update local day data
      const newData = {
        income:  dayData.income.map(e => (e.name || '').toLowerCase() === oldName.toLowerCase() ? { ...e, name: newName } : e),
        expense: dayData.expense.map(e => (e.name || '').toLowerCase() === oldName.toLowerCase() ? { ...e, name: newName } : e),
      };
      setDayData(newData);
      await loadAllDays();
      showStatus(`Renamed "${oldName}" → "${newName}" on all pages.`);
    } catch (e) {
      showStatus('Error renaming.', true);
    }
  };

  const handleCategorySave = async (cats) => {
    setCategories(cats);
    await saveCategories(cats);
  };

  const handleMastersSave = async (ms) => {
    setMasters(ms);
    await saveMasters(ms);
  };

  const handleCompanySave = async (name) => {
    setCompanyName(name);
    await saveCompanyName(name);
  };

  if (loading) return (
    <div className="rojmel-wrap">
      <div className="spinner-wrap"><div className="spinner" /></div>
    </div>
  );

  return (
    <div className="rojmel-wrap">
      {/* ── HEADER ── */}
      <header className="top">
        <div className="header-left">
          <button className="master-btn" onClick={() => setShowMaster(true)}>
            <span className="icon"><span/><span/><span/></span> Master
          </button>
          <button className="report-btn no-print" onClick={() => setShowSearch(true)}>Report</button>
          <Link to="/pagar" className="nav-btn">💼 Pagar</Link>
          <Link to="/khata" className="nav-btn">📒 Khata</Link>
          <div className="brand">
            <h1 className="serif">ROJMEL</h1>
            <span>Income and expense book</span>
          </div>
        </div>
        <div className="header-right">
          <div className="datebox">
            <button className="date-nav" onClick={prevDay}>‹</button>
            <span className="date-label">{displayDate(currentDate)}</span>
            <button className="date-nav" onClick={nextDay}>›</button>
            <input
              type="date"
              className="date-picker-hidden"
              value={toKey(currentDate)}
              onChange={e => e.target.value && goToDate(fromKey(e.target.value))}
            />
          </div>
          <button className="search-btn" onClick={() => setShowSearch(true)} aria-label="Search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
          </button>
        </div>
      </header>

      {/* ── BOARD ── */}
      <div className="board">
        {/* INCOME */}
        <section className="panel income">
          <h2><span className="dot income-dot"/>&nbsp;Aavak</h2>
          <div className="rows">
            {prevNetCarry && (
              <div className={`row carry-row${prevNetCarry.amount < 0 ? ' carry-neg' : ''}`}>
                <div className="who">
                  <div className="name">
                    Balance{' '}
                    <small className="carry-badge">📅 {prevNetCarry.fromDate}</small>
                  </div>
                </div>
                <div className="amount-box">
                  {prevNetCarry.amount < 0 ? '−' : ''}{rupee(prevNetCarry.amount)}
                </div>
              </div>
            )}
            {dayData.income.map(e => (
              <EntryRow
                key={e.id} entry={e}
                masterEntries={masterEntries}
                onDelete={() => deleteEntry('income', e.id)}
                onAmountChange={(amt) => updateAmount('income', e.id, amt)}
                onNoteChange={(note) => updateNote('income', e.id, note)}
              />
            ))}
          </div>
          <div className="add-entry-bar">
            <button className="picker-btn" onClick={() => setShowMaster(true)}>➕ Add Entry</button>
          </div>
          <div className="totals"><span>Total income</span><b className="rupee-font">{rupee(inc)}</b></div>
        </section>

        {/* EXPENSE */}
        <section className="panel expense">
          <h2><span className="dot expense-dot"/>&nbsp;Kharch</h2>
          <div className="rows">
            {dayData.expense.map(e => (
              <EntryRow
                key={e.id} entry={e}
                masterEntries={masterEntries}
                onDelete={() => deleteEntry('expense', e.id)}
                onAmountChange={(amt) => updateAmount('expense', e.id, amt)}
                onNoteChange={(note) => updateNote('expense', e.id, note)}
              />
            ))}
          </div>
          <div className="add-entry-bar">
            <button className="picker-btn" onClick={() => setShowMaster(true)}>➕ Add Entry</button>
          </div>
          <div className="totals"><span>Total expense</span><b className="rupee-font">{rupee(exp)}</b></div>
        </section>
      </div>

      {/* ── NET BAR ── */}
      <div className="net-bar">
        <div className="net-pills">
          <div className="pill"><span className="dot income-dot"/><b className="rupee-font inc">{rupee(inc)}</b></div>
          <div className="pill op">−</div>
          <div className="pill"><span className="dot expense-dot"/><b className="rupee-font exp">{rupee(exp)}</b></div>
          <div className="pill op">=</div>
        </div>
        <div className="net-inline">
          <div className={`net-value rupee-font ${net >= 0 ? 'pos' : 'neg'}`}>
            {net < 0 ? '−' : ''}{rupee(net)}
          </div>
          <div className="net-label">Today Balance</div>
        </div>
      </div>

      {/* ── STATUS ── */}
      <div className="status-bar" style={{ color: statusErr ? 'var(--danger)' : 'var(--ink-faint)' }}>
        {status}
      </div>

      {/* ── MODALS ── */}
      {showMaster && (
        <MasterModal
          categories={categories}
          masters={masters}
          workers={workers}
          masterEntries={masterEntries}
          companyName={companyName}
          allDays={allDays}
          currentDate={currentDate}
          dayData={dayData}
          onClose={() => setShowMaster(false)}
          onSaveMaster={handleMasterSave}
          onDeleteWorker={handleMasterDelete}
          onRenameWorker={handleMasterRename}
          onCategorySave={handleCategorySave}
          onMastersSave={handleMastersSave}
          onCompanySave={handleCompanySave}
          onAddEntry={addEntry}
        />
      )}
      {showSearch && (
        <SearchModal
          allDays={allDays}
          onClose={() => setShowSearch(false)}
        />
      )}
    </div>
  );
}

// ── Entry Row Component ──
function EntryRow({ entry, masterEntries, onDelete, onAmountChange, onNoteChange }) {
  const [editAmt, setEditAmt]   = useState(false);
  const [editNote, setEditNote] = useState(false);
  const [amtVal, setAmtVal]     = useState(entry.amount || 0);
  const [noteVal, setNoteVal]   = useState(entry.note || '');

  const committingAmt  = useRef(false);
  const committingNote = useRef(false);

  const found = masterEntries.find(m => m.name && m.name.toLowerCase() === (entry.name || '').toLowerCase());
  const subCat = (found && found.master) ? found.master : (entry.master || '');

  const commitAmt = async () => {
    if (committingAmt.current) return;
    committingAmt.current = true;
    const v = parseFloat(amtVal);
    const val = (!isNaN(v) && v >= 0) ? v : (entry.amount || 0);
    setAmtVal(val); setEditAmt(false);
    await onAmountChange(val);
    committingAmt.current = false;
  };

  const commitNote = async () => {
    if (committingNote.current) return;
    committingNote.current = true;
    setEditNote(false);
    await onNoteChange(noteVal.trim());
    committingNote.current = false;
  };

  return (
    <div className="row">
      <div className="who">
        <div className="name">
          {entry.name}
          {subCat && <span className="subcat-tag">{subCat}</span>}
        </div>
        <div className="note-box" onClick={() => { setEditNote(true); setNoteVal(entry.note || ''); }}>
          {editNote ? (
            <input
              autoFocus
              value={noteVal}
              onChange={e => setNoteVal(e.target.value)}
              onBlur={commitNote}
              onKeyDown={e => { if (e.key === 'Enter') commitNote(); if (e.key === 'Escape') setEditNote(false); }}
              style={{ width: '100px', border: 'none', background: 'transparent', outline: 'none', fontSize: '12px', fontWeight: 600 }}
              onClick={e => e.stopPropagation()}
            />
          ) : (
            entry.note
              ? <span>{entry.note}</span>
              : <span style={{ opacity: 0.6, fontStyle: 'italic' }}>+ note</span>
          )}
        </div>
      </div>
      <div className="amount-box" onClick={() => { setEditAmt(true); setAmtVal(entry.amount || 0); }}>
        {editAmt ? (
          <input
            type="number" autoFocus min="0" step="1"
            value={amtVal}
            onChange={e => setAmtVal(e.target.value)}
            onBlur={commitAmt}
            onKeyDown={e => { if (e.key === 'Enter') commitAmt(); if (e.key === 'Escape') setEditAmt(false); }}
            onClick={e => e.stopPropagation()}
            style={{ width: '65px', border: 'none', background: 'transparent', outline: 'none', fontSize: '14.5px', fontWeight: 700, textAlign: 'center', padding: 0 }}
          />
        ) : (
          rupee(entry.amount)
        )}
      </div>
      <button className="del" onClick={onDelete} aria-label="Delete">✕</button>
    </div>
  );
}
