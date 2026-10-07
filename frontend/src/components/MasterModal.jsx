import { useState, useRef } from 'react';
import { uid } from '../utils';
import './MasterModal.css';

export default function MasterModal({
  categories, masters, workers, masterEntries, companyName,
  allDays, currentDate, dayData,
  onClose, onSaveMaster, onDeleteWorker, onRenameWorker,
  onCategorySave, onMastersSave, onCompanySave, onAddEntry,
}) {
  const [view, setView]             = useState('list');   // 'list' | 'form'
  const [selectedEntry, setSelected] = useState(null);
  const [compVal, setCompVal]        = useState(companyName || '');
  const [compSaved, setCompSaved]    = useState(false);
  const [formState, setFormState]    = useState({
    name: '', category: '', master: '', fixedLabel: '', pagarAmount: '', note: '',
  });
  const [entryType, setEntryType]   = useState('income'); // for picker add
  const [formErr, setFormErr]        = useState('');
  const [saving, setSaving]          = useState(false);
  const [catPanelOpen, setCatPanel]  = useState(false);
  const [namePanelOpen, setNamePanel] = useState(false);
  const [masterPanelOpen, setMasterPanel] = useState(false);
  const [newCat, setNewCat]          = useState('');
  const [newName, setNewName]        = useState('');
  const [newMasterSub, setNewMasterSub] = useState('');
  const [renaming, setRenaming]      = useState(null); // { name } being renamed
  const [renameVal, setRenameVal]    = useState('');

  // Collect all unique names
  const allNames = Array.from(new Set([
    ...workers,
    ...masterEntries.map(m => m.name).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));

  const clickTimer = useRef(null);

  // ── Select a name from the list (single click) ──
  const handleNameClick = (name) => {
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => {
      const found = masterEntries.find(m => m.name && m.name.toLowerCase() === name.toLowerCase());
      setFormState({
        name,
        category:    found?.category    || '',
        master:      found?.master      || '',
        fixedLabel:  found?.fixedLabel  || '',
        pagarAmount: found?.pagarAmount || '',
        note:        found?.note        || '',
      });
      setFormErr('');
      setView('form');
      setSelected(name);
    }, 220);
  };

  // ── Quick add entry for today ──
  const handleQuickAdd = async (name, type) => {
    const entry = {
      id: uid(), name,
      amount: 0, note: '',
      category: masterEntries.find(m => m.name?.toLowerCase() === name.toLowerCase())?.category || '',
      master:   masterEntries.find(m => m.name?.toLowerCase() === name.toLowerCase())?.master   || '',
    };
    await onAddEntry(type, entry);
    onClose();
  };

  // ── Save form ──
  const handleSave = async () => {
    const name = formState.name.trim();
    if (!name) { setFormErr('Enter a name.'); return; }
    setSaving(true);
    try {
      await onSaveMaster({ ...formState, name, id: uid() });
      setView('list'); setSelected(null);
    } catch (e) { setFormErr('Error saving.'); }
    setSaving(false);
  };

  // ── Delete name ──
  const handleDelete = async (name) => {
    if (!window.confirm(`Delete "${name}" and remove all its data across all pages?`)) return;
    await onDeleteWorker(name);
    if (selectedEntry === name) { setView('list'); setSelected(null); }
  };

  // ── Rename ──
  const startRename = (name, e) => {
    if (e) e.stopPropagation();
    if (clickTimer.current) clearTimeout(clickTimer.current);
    setRenaming(name); setRenameVal(name);
  };
  const commitRename = async () => {
    const newN = renameVal.trim();
    if (!newN || newN === renaming) { setRenaming(null); return; }
    await onRenameWorker(renaming, newN);
    if (selectedEntry === renaming) {
      setSelected(newN);
      setFormState(prev => ({ ...prev, name: newN }));
    }
    setRenaming(null);
  };

  // ── Add new category ──
  const addCat = async () => {
    const v = newCat.trim(); if (!v) return;
    if (!categories.includes(v)) {
      const cats = [...categories, v];
      await onCategorySave(cats);
    }
    setFormState(prev => ({ ...prev, category: v }));
    setNewCat(''); setCatPanel(false);
  };

  // ── Add new worker name ──
  const addWorkerName = async () => {
    const v = newName.trim(); if (!v) return;
    await onSaveMaster({ name: v, category: '', master: '', fixedLabel: '', pagarAmount: '', note: '', id: uid() });
    setFormState(prev => ({ ...prev, name: v }));
    setNewName(''); setNamePanel(false);
  };

  // ── Add new sub-category ──
  const addMasterSub = async () => {
    const v = newMasterSub.trim(); if (!v) return;
    if (!masters.includes(v)) {
      const ms = [...masters, v];
      await onMastersSave(ms);
    }
    setFormState(prev => ({ ...prev, master: v }));
    setNewMasterSub(''); setMasterPanel(false);
  };

  const isFactoryKarigar = formState.category.toLowerCase() === 'factory karigar';

  return (
    <div className="overlay open" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal master-modal">
        {/* HEADER */}
        <div className="mm-header">
          {view === 'form'
            ? <button className="back-btn" onClick={() => { setView('list'); setSelected(null); }}>← Back</button>
            : <div />
          }
          <h3>{view === 'form' ? (selectedEntry ? 'Edit Master' : 'Add Master') : 'Master'}</h3>
          <button className="close-x" onClick={onClose}>✕</button>
        </div>

        {view === 'list' ? (
          /* ── LIST VIEW ── */
          <div className="mm-list-view">
            {/* Company Name */}
            <div className="company-section">
              <label>🏢 Company Name (દુકાન / ફેક્ટરી નામ)</label>
              <div className="company-row">
                <input
                  className="form-input"
                  value={compVal}
                  onChange={e => setCompVal(e.target.value)}
                  placeholder="e.g. TAPU FAB"
                />
                <button
                  className={`confirm-btn ${compSaved ? 'saved' : ''}`}
                  onClick={async () => {
                    await onCompanySave(compVal);
                    setCompSaved(true);
                    setTimeout(() => setCompSaved(false), 1500);
                  }}
                >
                  {compSaved ? '✓ Saved!' : 'Save Name'}
                </button>
              </div>
            </div>

            <div className="mm-divider" />

            {/* Name List */}
            <div className="mm-names-header">
              <span className="mm-section-label">Names</span>
              <button className="plus-btn" onClick={() => setNamePanel(p => !p)}>
                {namePanelOpen ? '×' : '+'}
              </button>
            </div>

            {namePanelOpen && (
              <div className="add-panel open">
                <label>Save a new name to your list</label>
                <div className="add-row">
                  <input
                    autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                    placeholder="Enter name to save"
                    onKeyDown={e => { if (e.key === 'Enter') addWorkerName(); }}
                  />
                  <button className="confirm-btn" onClick={addWorkerName}>Save</button>
                </div>
              </div>
            )}

            <div className="name-list">
              {allNames.length === 0 && (
                <div className="empty-hint">No names yet. Click + to add a name.</div>
              )}
              {allNames.map(name => (
                <div key={name} className="name-list-wrapper">
                  <div
                    className={`name-list-item ${selectedEntry === name ? 'active' : ''}`}
                    onClick={() => handleNameClick(name)}
                  >
                    <span className="name-label" title="Click to edit · Double-click to rename"
                      onDoubleClick={e => startRename(name, e)}>{name}</span>
                    <button className="rename-btn" title="Rename" onClick={e => startRename(name, e)}>✏️</button>
                    <button className="del-btn" title="Delete" onClick={e => { e.stopPropagation(); handleDelete(name); }}>✕</button>
                  </div>
                  {renaming === name && (
                    <div className="name-rename-row open" onClick={e => e.stopPropagation()}>
                      <input
                        autoFocus
                        value={renameVal}
                        onChange={e => setRenameVal(e.target.value)}
                        placeholder="New name..."
                        onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenaming(null); }}
                      />
                      <button className="confirm-btn" style={{ fontSize: '12px', padding: '4px 10px', whiteSpace: 'nowrap' }} onClick={commitRename}>
                        Save Change
                      </button>
                    </div>
                  )}
                  <div className="quick-add-row">
                    <button className="quick-add-btn income" onClick={() => handleQuickAdd(name, 'income')}>+ Aavak</button>
                    <button className="quick-add-btn expense" onClick={() => handleQuickAdd(name, 'expense')}>+ Kharch</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* ── FORM VIEW ── */
          <div className="mm-form-view">
            {/* Name field */}
            <div className="mm-field-group">
              <label>Name</label>
              <div className="field-row">
                <div className="field-main">
                  <select
                    className="form-input"
                    value={formState.name}
                    onChange={e => setFormState(prev => ({ ...prev, name: e.target.value }))}
                  >
                    <option value="">-- Select Name --</option>
                    {allNames.map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </div>
                <button className={`plus-btn ${namePanelOpen ? 'active' : ''}`} onClick={() => setNamePanel(p => !p)}>
                  {namePanelOpen ? '×' : '+'}
                </button>
              </div>
              {namePanelOpen && (
                <div className="add-panel open">
                  <label>New name</label>
                  <div className="add-row">
                    <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                      placeholder="Enter name" onKeyDown={e => e.key === 'Enter' && addWorkerName()} />
                    <button className="confirm-btn" onClick={addWorkerName}>Save</button>
                  </div>
                </div>
              )}
            </div>

            {/* Category */}
            <div className="mm-field-group">
              <label>Category</label>
              <div className="field-row">
                <div className="field-main">
                  <select
                    className="form-input"
                    value={formState.category}
                    onChange={e => setFormState(prev => ({ ...prev, category: e.target.value }))}
                  >
                    <option value="">-- Select Category --</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <button className={`plus-btn ${catPanelOpen ? 'active' : ''}`} onClick={() => setCatPanel(p => !p)}>
                  {catPanelOpen ? '×' : '+'}
                </button>
              </div>
              {catPanelOpen && (
                <div className="add-panel open">
                  <label>New category name</label>
                  <div className="add-row">
                    <input autoFocus value={newCat} onChange={e => setNewCat(e.target.value)}
                      placeholder="e.g. Electricity" onKeyDown={e => e.key === 'Enter' && addCat()} />
                    <button className="confirm-btn" onClick={addCat}>Save</button>
                  </div>
                </div>
              )}
            </div>

            {/* Factory Karigar extra fields */}
            {isFactoryKarigar && (
              <>
                <div className="mm-field-group">
                  <label>Sub Category</label>
                  <div className="field-row">
                    <div className="field-main">
                      <select
                        className="form-input"
                        value={formState.master}
                        onChange={e => setFormState(prev => ({ ...prev, master: e.target.value }))}
                      >
                        <option value="">-- Select Sub Category --</option>
                        {masters.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </div>
                    <button className={`plus-btn ${masterPanelOpen ? 'active' : ''}`} onClick={() => setMasterPanel(p => !p)}>
                      {masterPanelOpen ? '×' : '+'}
                    </button>
                  </div>
                  {masterPanelOpen && (
                    <div className="add-panel open">
                      <label>Add new Sub Category</label>
                      <div className="add-row">
                        <input autoFocus value={newMasterSub} onChange={e => setNewMasterSub(e.target.value)}
                          placeholder="e.g. Weaving" onKeyDown={e => e.key === 'Enter' && addMasterSub()} />
                        <button className="confirm-btn" onClick={addMasterSub}>Save</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mm-field-group">
                  <label>Pagar Type</label>
                  <select className="form-input" value={formState.fixedLabel}
                    onChange={e => setFormState(prev => ({ ...prev, fixedLabel: e.target.value }))}>
                    <option value="">-- Select Fix / Daily Pagar --</option>
                    <option value="Fix Pagar">Fix Pagar</option>
                    <option value="Daily Pagar">Daily Pagar</option>
                  </select>
                </div>
                {formState.fixedLabel && (
                  <div className="mm-field-group">
                    <label>Pagar Amount (₹)</label>
                    <input type="number" className="form-input" min="0"
                      placeholder="Enter Pagar Amount"
                      value={formState.pagarAmount}
                      onChange={e => setFormState(prev => ({ ...prev, pagarAmount: e.target.value }))} />
                  </div>
                )}
              </>
            )}

            {/* Note */}
            <div className="mm-field-group">
              <label>Note (optional)</label>
              <input type="text" className="form-input" placeholder="Optional note"
                value={formState.note}
                onChange={e => setFormState(prev => ({ ...prev, note: e.target.value }))} />
            </div>

            {formErr && <div className="err-msg visible">{formErr}</div>}

            {/* Actions */}
            <div className="modal-actions" style={{ marginTop: 12 }}>
              <button className="btn-cancel" onClick={() => { setView('list'); setSelected(null); }}>← Back</button>
              <button className="btn-save" onClick={handleSave} disabled={saving}>
                {saving ? 'Saving…' : (selectedEntry ? 'Save Change' : 'Add Master')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
