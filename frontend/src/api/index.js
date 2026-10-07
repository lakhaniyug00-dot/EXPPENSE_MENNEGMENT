import axios from 'axios';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

const api = axios.create({ baseURL: BASE });

// ── DAYS (Rojmel daily entries) ──
export const getDays = () => api.get('/days').then(r => r.data);
export const getDay  = (dateKey) => api.get(`/days/${dateKey}`).then(r => r.data);
export const saveDay = (dateKey, data) => api.put(`/days/${dateKey}`, data).then(r => r.data);

// ── CONFIG (categories, workers, masters, company) ──
export const getConfig       = () => api.get('/config').then(r => r.data);
export const saveCategories  = (categories) => api.put('/config/categories', { categories }).then(r => r.data);
export const saveMasters     = (masters)    => api.put('/config/masters', { masters }).then(r => r.data);
export const saveWorkers     = (workers)    => api.put('/config/workers', { workers }).then(r => r.data);
export const saveCompanyName = (companyName) => api.put('/config/company', { companyName }).then(r => r.data);

// ── MASTER ENTRIES ──
export const getMasterEntries  = () => api.get('/masters').then(r => r.data);
export const saveMasterEntry   = (entry)  => api.post('/masters', entry).then(r => r.data);
export const renameMaster      = (oldName, newName) => api.put('/masters/rename', { oldName, newName }).then(r => r.data);
export const deleteMasterEntry = (name)   => api.delete(`/masters/${encodeURIComponent(name)}`).then(r => r.data);

// ── ACCOUNTS (Khata) ──
export const getAccounts       = () => api.get('/accounts').then(r => r.data);
export const getAccount        = (id)  => api.get(`/accounts/${id}`).then(r => r.data);
export const createAccount     = (data) => api.post('/accounts', data).then(r => r.data);
export const addTransaction    = (id, tx) => api.post(`/accounts/${id}/transactions`, tx).then(r => r.data);
export const deleteTransaction = (id, txId) => api.delete(`/accounts/${id}/transactions/${txId}`).then(r => r.data);
export const updateAccount     = (id, data) => api.put(`/accounts/${id}`, data).then(r => r.data);
export const deleteAccount     = (id) => api.delete(`/accounts/${id}`).then(r => r.data);
