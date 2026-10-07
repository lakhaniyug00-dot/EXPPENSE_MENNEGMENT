// Format number as Indian Rupee
export const rupee = (n) => '₹' + Math.round(Math.abs(Number(n || 0))).toLocaleString('en-IN');

// Generate a unique ID
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Date helpers
export const toKey = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

export const fromKey = (k) => {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const displayDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  const label = date.toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
  });
  return toKey(date) === toKey(new Date()) ? `Today · ${label}` : label;
};

export const shortDate = (d) => {
  const date = d instanceof Date ? d : new Date(d);
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

// Escape HTML for display
export const escHtml = (s) =>
  String(s || '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
