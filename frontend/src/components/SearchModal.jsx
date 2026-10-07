import { useState, useMemo } from 'react';
import { rupee, displayDate, fromKey } from '../utils';
import './SearchModal.css';

export default function SearchModal({ allDays, onClose }) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.toLowerCase();
    const found = [];
    allDays.forEach(day => {
      const date = fromKey(day.dateKey);
      const checkEntry = (e, type) => {
        if (
          (e.name  && e.name.toLowerCase().includes(q)) ||
          (String(e.amount).includes(q)) ||
          (e.category && e.category.toLowerCase().includes(q)) ||
          (e.note && e.note.toLowerCase().includes(q))
        ) {
          found.push({ ...e, _dateKey: day.dateKey, _date: date, _type: type });
        }
      };
      (day.income  || []).forEach(e => checkEntry(e, 'income'));
      (day.expense || []).forEach(e => checkEntry(e, 'expense'));
    });
    return found.sort((a, b) => b._dateKey.localeCompare(a._dateKey));
  }, [query, allDays]);

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal search-modal">
        <button className="close-x" onClick={onClose}>✕</button>
        <h3>Search</h3>
        <p className="modal-sub">Search across all dates — names, amounts, categories</p>

        <div className="search-input-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            autoFocus type="text" placeholder="Type to search..."
            value={query} onChange={e => setQuery(e.target.value)}
          />
        </div>

        <div className="search-results">
          {query && results.length === 0 && (
            <div className="search-empty">No results found.</div>
          )}
          {results.map((e, i) => (
            <div key={i} className="search-result-item">
              <div className="sr-left">
                <div className="sr-date">{displayDate(e._date)}</div>
                <div className="sr-name">{e.name}</div>
                <div className="sr-meta">
                  {e.category && <span>{e.category}</span>}
                  {e.master   && <span>· {e.master}</span>}
                  {e.note     && <span>· {e.note}</span>}
                </div>
              </div>
              <div className="sr-right">
                <div className={`sr-amount rupee-font ${e._type === 'income' ? 'inc' : 'exp'}`}>
                  {rupee(e.amount)}
                </div>
                <div className="sr-type">{e._type === 'income' ? 'Aavak' : 'Kharch'}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
