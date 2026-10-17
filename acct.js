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

  /* ---------- shared ledger: manual entries + entries derived from sales/purchases/expenses ---------- */
  const pad = n => String(n).padStart(2, '0');
  const ymd = ms => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const sumP = r => (r.payments || []).reduce((t, p) => t + (p.amount || 0), 0);
  const KIND = { sale: 'ရောင်းရငွေ', debtIn: 'အကြွေးလက်ခံ', cod: 'COD လက်ခံ', deposit: 'ငွေထည့်',
                 purchase: 'ဝယ်ယူမှု', debtOut: 'အကြွေးပေးချေ', expense: 'အသုံးစရိတ်', withdraw: 'ငွေထုတ်', xfer: 'ငွေလွှဲ' };
  function build(meta, sales, purchases, expenses) {
    const accts = meta.filter(m => String(m.id).startsWith('acct-')).sort((a, b) => a.createdAt - b.createdAt);
    const entries = meta.filter(m => String(m.id).startsWith('acx-'))
      .map(m => ({ ...m, auto: false, kind: m.type === 'in' ? 'deposit' : m.type === 'out' ? 'withdraw' : 'xfer' }));
    const add = (kind, type, acctId, amount, date, createdAt, title, note) => {
      if (acctId && amount > 0) entries.push({ id: null, auto: true, kind, type, from: type === 'out' ? acctId : null, to: type === 'in' ? acctId : null,
        amount, date, createdAt: createdAt || 0, title, note });
    };
    (sales || []).forEach(s => {
      add('sale', 'in', s.acctId, (s.paid || 0) - sumP(s) - (s.change || 0), ymd(s.createdAt), s.createdAt, `ရောင်းရငွေ · ${s.no}`, s.customerName || '');
      (s.payments || []).forEach(p => add('debtIn', 'in', p.acctId, p.amount, p.date, p.createdAt, `အကြွေးလက်ခံ · ${s.no}`, s.customerName || p.note || ''));
      const d = s.delivery;                       // COD cash collected on delivery
      if (d && d.status === 'settled' && d.acctId) add('cod', 'in', d.acctId, d.received || 0, ymd(d.settledAt || s.createdAt), d.settledAt || s.createdAt, `COD လက်ခံ · ${s.no}`, s.customerName || d.note || '');
    });
    (purchases || []).forEach(po => {
      add('purchase', 'out', po.acctId, (po.paid || 0) - sumP(po), po.date, po.createdAt, `ဝယ်ယူမှု · ${po.no}`, po.supplier || '');
      (po.payments || []).forEach(p => add('debtOut', 'out', p.acctId, p.amount, p.date, p.createdAt, `အကြွေးပေးချေ · ${po.no}`, po.supplier || p.note || ''));
    });
    (expenses || []).forEach(e => add('expense', 'out', e.acctId, e.amount, e.date, e.createdAt, `အသုံးစရိတ် · ${e.category}`, e.note || ''));
    return { accts, entries };
  }
  window.ACCT = { list, fill, remember, build, KIND };
})();
