import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { getAccounts, createAccount, addTransaction, deleteTransaction, updateAccount, deleteAccount } from '../api';
import { rupee, uid, shortDate } from '../utils';
import './Khata.css';

export default function Khata() {
  const [accounts, setAccounts]     = useState([]);
  const [selected, setSelected]     = useState(null); // account object
  const [loading, setLoading]       = useState(true);
  const [status, setStatus]         = useState('');

  // New account form
  const [showNewAcc, setShowNewAcc] = useState(false);
  const [newAccName, setNewAccName] = useState('');

  // New transaction form
  const [txForm, setTxForm]   = useState({ type: 'credit', amount: '', note: '', date: '' });
  const [showTxForm, setShowTxForm] = useState(false);

  const showMsg = (msg) => { setStatus(msg); setTimeout(() => setStatus(''), 2000); };

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try { setAccounts(await getAccounts()); } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { loadAccounts(); }, [loadAccounts]);

  // Reload selected account after changes
  const refreshSelected = useCallback(async (id) => {
    const list = await getAccounts();
    setAccounts(list);
    const acc = list.find(a => a.id === id);
    if (acc) setSelected(acc);
  }, []);

  // ── Create account ──
  const handleCreateAccount = async () => {
    const name = newAccName.trim();
    if (!name) return;
    try {
      const acc = await createAccount({ id: uid(), name });
      setAccounts(prev => [...prev, acc]);
      setNewAccName(''); setShowNewAcc(false);
      showMsg(`Account "${name}" created.`);
    } catch (e) { showMsg('Error creating account.'); }
  };

  // ── Add transaction ──
  const handleAddTx = async () => {
    if (!txForm.amount) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const tx = {
        id: uid(), date: txForm.date || today,
        type: txForm.type, amount: Number(txForm.amount),
        note: txForm.note,
      };
      await addTransaction(selected.id, tx);
      await refreshSelected(selected.id);
      setTxForm({ type: 'credit', amount: '', note: '', date: '' });
      setShowTxForm(false);
      showMsg('Transaction added.');
    } catch (e) { showMsg('Error adding transaction.'); }
  };

  // ── Delete transaction ──
  const handleDelTx = async (txId) => {
    try {
      await deleteTransaction(selected.id, txId);
      await refreshSelected(selected.id);
    } catch (e) { showMsg('Error deleting.'); }
  };

  // ── Delete account ──
  const handleDelAccount = async (id, name) => {
    if (!window.confirm(`Delete account "${name}"?`)) return;
    try {
      await deleteAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
      if (selected?.id === id) setSelected(null);
      showMsg(`Deleted "${name}".`);
    } catch (e) { showMsg('Error deleting account.'); }
  };

  // ── Balance calculation ──
  const calcBalance = (transactions = []) => {
    return transactions.reduce((bal, tx) => {
      return tx.type === 'credit' ? bal + Number(tx.amount) : bal - Number(tx.amount);
    }, 0);
  };

  return (
    <div className="khata-wrap">
      {/* HEADER */}
      <header className="top">
        <div className="top-left">
          <Link to="/rojmel" className="nav-btn">← Rojmel</Link>
          <Link to="/pagar" className="nav-btn">💼 Pagar</Link>
          <div className="logo">Khata <span>Book</span></div>
        </div>
        <div className="top-right">
          <span className="status-inline">{status}</span>
          <button className="nav-btn" style={{ background: 'var(--ink)', color: '#fff', borderColor: 'var(--ink)' }}
            onClick={() => { setShowNewAcc(true); setSelected(null); }}>
            + New Account
          </button>
        </div>
      </header>

      <div className="khata-body">
        {/* ACCOUNTS SIDEBAR */}
        <aside className="accounts-list">
          <div className="list-header">Accounts</div>
          {loading && <div className="spinner-wrap"><div className="spinner" /></div>}
          {!loading && accounts.length === 0 && (
            <div className="empty-hint">No accounts yet. Create one →</div>
          )}
          {accounts.map(acc => {
            const bal = calcBalance(acc.transactions);
            return (
              <div
                key={acc.id}
                className={`account-card ${selected?.id === acc.id ? 'active' : ''}`}
                onClick={() => setSelected(acc)}
              >
                <div className="acc-name">{acc.name}</div>
                <div className={`acc-bal rupee-font ${bal >= 0 ? 'pos' : 'neg'}`}>{bal < 0 ? '−' : ''}{rupee(bal)}</div>
              </div>
            );
          })}
        </aside>

        {/* ACCOUNT DETAIL */}
        <main className="account-detail">
          {/* New Account form */}
          {showNewAcc && (
            <div className="new-acc-form">
              <h3>New Account</h3>
              <input className="form-input" autoFocus placeholder="Account / Person name"
                value={newAccName} onChange={e => setNewAccName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateAccount(); }} />
              <div className="modal-actions" style={{ marginTop: 8 }}>
                <button className="btn-cancel" onClick={() => setShowNewAcc(false)}>Cancel</button>
                <button className="btn-save"   onClick={handleCreateAccount}>Create</button>
              </div>
            </div>
          )}

          {!selected && !showNewAcc && (
            <div className="detail-empty">← Select an account to view transactions</div>
          )}

          {selected && (
            <>
              {/* Account header */}
              <div className="detail-header">
                <div>
                  <h2>{selected.name}</h2>
                  <div className={`detail-bal rupee-font ${calcBalance(selected.transactions) >= 0 ? 'pos' : 'neg'}`}>
                    Balance: {rupee(calcBalance(selected.transactions))}
                  </div>
                </div>
                <div className="detail-actions">
                  <button className="btn-save" style={{ padding: '7px 14px' }} onClick={() => setShowTxForm(p => !p)}>
                    {showTxForm ? '× Cancel' : '+ Add Transaction'}
                  </button>
                  <button className="del-acc-btn" onClick={() => handleDelAccount(selected.id, selected.name)}>🗑</button>
                </div>
              </div>

              {/* Add Transaction Form */}
              {showTxForm && (
                <div className="tx-form">
                  <div className="tx-type-row">
                    {['credit', 'debit'].map(t => (
                      <button key={t}
                        className={`tx-type-btn ${txForm.type === t ? `active-${t}` : ''}`}
                        onClick={() => setTxForm(p => ({ ...p, type: t }))}
                      >
                        {t === 'credit' ? '↑ Jama (Credit)' : '↓ Udhar (Debit)'}
                      </button>
                    ))}
                  </div>
                  <div className="tx-fields">
                    <input className="form-input" type="number" min="0" placeholder="Amount (₹)"
                      value={txForm.amount} onChange={e => setTxForm(p => ({ ...p, amount: e.target.value }))} />
                    <input className="form-input" type="date"
                      value={txForm.date} onChange={e => setTxForm(p => ({ ...p, date: e.target.value }))} />
                    <input className="form-input" type="text" placeholder="Note (optional)"
                      value={txForm.note} onChange={e => setTxForm(p => ({ ...p, note: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && handleAddTx()} />
                    <button className="btn-save" onClick={handleAddTx}>Save</button>
                  </div>
                </div>
              )}

              {/* Transaction list */}
              <div className="tx-list">
                {selected.transactions.length === 0 && (
                  <div className="empty-hint">No transactions yet.</div>
                )}
                {[...selected.transactions].reverse().map(tx => (
                  <div key={tx.id} className={`tx-row ${tx.type}`}>
                    <div className="tx-left">
                      <div className="tx-date">{tx.date ? shortDate(new Date(tx.date)) : '—'}</div>
                      <div className="tx-note">{tx.note || '—'}</div>
                    </div>
                    <div className="tx-right">
                      <div className={`tx-amount rupee-font ${tx.type}`}>
                        {tx.type === 'credit' ? '+' : '−'}{rupee(tx.amount)}
                      </div>
                      <button className="del tx-del" onClick={() => handleDelTx(tx.id)}>✕</button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </main>
      </div>

      <div className="status-bar">{status}</div>
    </div>
  );
}
