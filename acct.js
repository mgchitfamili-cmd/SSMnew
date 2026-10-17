/* Shared helper: money-account picker for the retail / purchase / expense / debt / customers pages.
   Accounts live in pos-db 'meta' as 'acct-…' records (managed on accounts.html). */
(() => {
  const KEY = 'pos-last-acct';
  const STORES = ['products', 'categories', 'units', 'meta', 'purchases', 'sales', 'expenses', 'adjustments', 'customers', 'suppliers'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function openDB() {
    return new Promise((res, rej) => {
      const r = indexedDB.open('pos-db', 5);
      r.onupgradeneeded = () => STORES.forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); });
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function list() {
    try {
      const db = await openDB();
      const rows = await new Promise((res, rej) => {
        const q = db.transaction('meta').objectStore('meta').getAll();
        q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
      });
      db.close();
      return rows.filter(m => String(m.id).startsWith('acct-')).sort((a, b) => a.createdAt - b.createdAt);
    } catch (e) { console.error(e); return []; }
  }
  /* current: undefined = use the last-used account; '' / id = use exactly that */
  async function fill(sel, current) {
    if (!sel) return;
    const l = await list();
    const wrap = sel.closest('.field'); if (wrap) wrap.hidden = !l.length;   // nothing to pick yet → hide the field
    sel.innerHTML = '<option value="">— မရွေးပါ —</option>' + l.map(a => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('');
    let v = current !== undefined ? current : (localStorage.getItem(KEY) || '');
    sel.value = l.some(a => a.id === v) ? v : '';
  }
  const remember = id => { try { if (id) localStorage.setItem(KEY, id); } catch (e) {} };
  window.ACCT = { list, fill, remember };
})();
