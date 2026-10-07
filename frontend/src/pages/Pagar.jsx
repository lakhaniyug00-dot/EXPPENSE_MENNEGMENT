import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getMasterEntries, getDays, getConfig } from '../api';
import { rupee, shortDate } from '../utils';
import './Pagar.css';

export default function Pagar() {
  const [tab, setTab]               = useState('op_slips');
  const [masterEntries, setMasterEntries] = useState([]);
  const [allDays, setAllDays]       = useState([]);
  const [config, setConfig]         = useState({ categories: [], masters: [], workers: [] });
  const [loading, setLoading]       = useState(true);
  const [month, setMonth]           = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [entries, days, cfg] = await Promise.all([getMasterEntries(), getDays(), getConfig()]);
      setMasterEntries(entries);
      setAllDays(days);
      setConfig(cfg);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derive worker lists ──
  const fixWorkers = masterEntries.filter(m => m.fixedLabel === 'Fix Pagar');
  const opWorkers  = masterEntries.filter(m => m.fixedLabel === 'Daily Pagar' || (!m.fixedLabel && m.name));

  // ── Filter days by selected month ──
  const monthDays = allDays.filter(d => d.dateKey && d.dateKey.startsWith(month));

  // ── Compute daily pagar (Op) totals per worker ──
  const opPagarMap = {};
  monthDays.forEach(day => {
    (day.income || []).forEach(e => {
      if (!e.name) return;
      const master = masterEntries.find(m => m.name?.toLowerCase() === e.name.toLowerCase());
      if (!master || master.fixedLabel === 'Fix Pagar') return;
      if (!opPagarMap[e.name]) opPagarMap[e.name] = { name: e.name, days: 0, total: 0, entries: [] };
      opPagarMap[e.name].total += Number(e.amount || 0);
      opPagarMap[e.name].days += 1;
      opPagarMap[e.name].entries.push({ date: day.dateKey, amount: e.amount, note: e.note });
    });
  });

  const opList = Object.values(opPagarMap).sort((a, b) => a.name.localeCompare(b.name));

  // ── Fix pagar list ──
  const fixList = fixWorkers.map(m => ({
    name: m.name,
    salary: Number(m.pagarAmount || 0),
    subCat: m.master || '',
  })).sort((a, b) => a.name.localeCompare(b.name));

  const tabs = [
    { key: 'op_slips', label: '📋 Daily Slips' },
    { key: 'op_total', label: '📊 Daily Total' },
    { key: 'fix_slips', label: '📋 Fix Slips' },
    { key: 'fix_total', label: '📊 Fix Total' },
  ];

  return (
    <div className="pagar-wrap">
      {/* HEADER */}
      <header className="top">
        <div className="top-left">
          <Link to="/rojmel" className="nav-btn">← Rojmel</Link>
          <Link to="/khata" className="nav-btn">📒 Khata</Link>
          <div className="logo">Pagar <span>Book</span></div>
        </div>
        <div className="top-right">
          <label className="month-label">
            Month:&nbsp;
            <input type="month" className="month-input" value={month} onChange={e => setMonth(e.target.value)} />
          </label>
        </div>
      </header>

      {/* TABS */}
      <div className="pagar-tabs">
        {tabs.map(t => (
          <button key={t.key} className={`pagar-tab ${tab === t.key ? 'active' : ''}`} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && <div className="spinner-wrap"><div className="spinner" /></div>}

      {!loading && (
        <div className="pagar-body">
          {/* ── DAILY SLIPS ── */}
          {tab === 'op_slips' && (
            <div className="slips-grid">
              {opList.length === 0 && <div className="empty-hint">No daily pagar workers found for {month}.</div>}
              {opList.map(w => (
                <div key={w.name} className="slip-card">
                  <div className="slip-name">{w.name}</div>
                  <div className="slip-meta">{w.days} day{w.days !== 1 ? 's' : ''} worked</div>
                  <div className="slip-entries">
                    {w.entries.map((en, i) => (
                      <div key={i} className="slip-entry-row">
                        <span className="slip-date">{en.date?.slice(8)} {new Date(en.date + 'T00:00:00').toLocaleString('en-IN', { month: 'short' })}</span>
                        <span className="slip-entry-amt rupee-font">{rupee(en.amount)}</span>
                      </div>
                    ))}
                  </div>
                  <div className="slip-total rupee-font">{rupee(w.total)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── DAILY TOTAL TABLE ── */}
          {tab === 'op_total' && (
            <div className="table-wrap">
              <table className="pagar-table">
                <thead><tr><th>Name</th><th>Days</th><th>Total Pagar</th></tr></thead>
                <tbody>
                  {opList.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--ink-faint)' }}>No data for {month}</td></tr>}
                  {opList.map(w => (
                    <tr key={w.name}>
                      <td>{w.name}</td>
                      <td>{w.days}</td>
                      <td className="num rupee-font">{rupee(w.total)}</td>
                    </tr>
                  ))}
                  {opList.length > 0 && (
                    <tr className="total-row">
                      <td><b>Total</b></td>
                      <td><b>{opList.reduce((s, w) => s + w.days, 0)}</b></td>
                      <td className="num rupee-font"><b>{rupee(opList.reduce((s, w) => s + w.total, 0))}</b></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* ── FIX SLIPS ── */}
          {tab === 'fix_slips' && (
            <div className="slips-grid">
              {fixList.length === 0 && <div className="empty-hint">No Fix Pagar workers found. Add them via Master.</div>}
              {fixList.map(w => (
                <div key={w.name} className="slip-card fix-card">
                  <div className="slip-name">{w.name}</div>
                  {w.subCat && <div className="slip-meta">{w.subCat}</div>}
                  <div className="slip-label">Monthly Salary</div>
                  <div className="slip-total rupee-font">{rupee(w.salary)}</div>
                </div>
              ))}
            </div>
          )}

          {/* ── FIX TOTAL ── */}
          {tab === 'fix_total' && (
            <div className="table-wrap">
              <table className="pagar-table">
                <thead><tr><th>Name</th><th>Sub Category</th><th>Monthly Salary</th></tr></thead>
                <tbody>
                  {fixList.length === 0 && <tr><td colSpan={3} style={{ textAlign: 'center', color: 'var(--ink-faint)' }}>No fix workers</td></tr>}
                  {fixList.map(w => (
                    <tr key={w.name}>
                      <td>{w.name}</td>
                      <td>{w.subCat || '—'}</td>
                      <td className="num rupee-font">{rupee(w.salary)}</td>
                    </tr>
                  ))}
                  {fixList.length > 0 && (
                    <tr className="total-row">
                      <td colSpan={2}><b>Total Monthly</b></td>
                      <td className="num rupee-font"><b>{rupee(fixList.reduce((s, w) => s + w.salary, 0))}</b></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <div className="status-bar" />
    </div>
  );
}
