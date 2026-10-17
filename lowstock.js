/* lowstock.js — လက်ကျန်နည်း သတိပေးချက် (shared by all pages)
   1) ဘေးမီနူးက "ကုန်ပစ္စည်း" နှင့် "ပစ္စည်းစာရင်း အစီရင်ခံစာ" ပေါ်မှာ အရေအတွက် badge ပြသည်
   (လက်ကျန်နည်းသော ပစ္စည်းများအပြင် ရက်ကုန်ခါနီး / ရက်ကုန်ပြီး ပစ္စည်းများကိုပါ ထည့်ရေတွက်သည်)
   2) အနှစ်ချုပ် စာမျက်နှာ ဖွင့်တိုင်း (session တစ်ခုလျှင် တစ်ကြိမ်) အောက်ခြေမှာ သတိပေးဘား ပြသည်
   3) လက်လီအရောင်း ပြီးတိုင်း လက်ကျန်နည်းသွားသော ပစ္စည်းများကို ပြသည် (POSLowStock.afterSale) */
(() => {
  const DB = 'pos-db', VER = 5;
  const STORES = ['products','categories','units','meta','purchases','sales','expenses','adjustments','customers','suppliers'];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  const qty = n => Number(n || 0).toLocaleString('en-US', { maximumFractionDigits: 3 });

  const isOut = p => p.active !== false && !(p.stock > 0);
  const isLow = p => p.active !== false && Number(p.minStock) > 0 && p.stock > 0 && !(p.stock > Number(p.minStock));
  // ရက်ကုန်ရက် (လက်ကျန်ရှိသော ပစ္စည်းအတွက်သာ): <0 = ကုန်ပြီး, <= ကြိုတင်သတိပေးရက် (မူလ ၃၀) = ကုန်ခါနီး
  const daysLeft = p => {
    if (!p.expiryDate) return null;
    const [y, m, d] = String(p.expiryDate).split('-').map(Number), t = new Date();
    const v = Math.round((new Date(y, m - 1, d) - new Date(t.getFullYear(), t.getMonth(), t.getDate())) / 86400000);
    return Number.isNaN(v) ? null : v;
  };
  const expState = p => {
    if (p.active === false || !(p.stock > 0)) return '';
    const d = daysLeft(p); if (d === null) return '';
    return d < 0 ? 'expired' : d <= (Number(p.expiryWarnDays) > 0 ? Number(p.expiryWarnDays) : 30) ? 'soon' : '';
  };

  function loadProducts() {
    return new Promise(res => {
      try {
        const r = indexedDB.open(DB, VER);
        r.onupgradeneeded = () => STORES.forEach(n => { if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); });
        r.onerror = () => res([]);
        r.onsuccess = () => {
          const db = r.result;
          try {
            const q = db.transaction('products').objectStore('products').getAll();
            q.onsuccess = () => { db.close(); res(q.result || []); };
            q.onerror = () => { db.close(); res([]); };
          } catch (e) { db.close(); res([]); }
        };
      } catch (e) { res([]); }
    });
  }

  async function summary() {
    const ps = await loadProducts();
    // "ကုန်နေ" ကို minStock သတ်မှတ်ထားသော ပစ္စည်းများအတွက်သာ သတိပေးသည် (stock မထည့်ရသေးသော ပစ္စည်းအသစ်များ မမှားစေရန်)
    const out = ps.filter(p => isOut(p) && Number(p.minStock) > 0);
    const low = ps.filter(isLow);
    const expired = ps.filter(p => expState(p) === 'expired'), soon = ps.filter(p => expState(p) === 'soon');
    const n = new Set([...out, ...low, ...expired, ...soon].map(p => p.id)).size;   // ပစ္စည်းတစ်ခု နှစ်ကြိမ် မရေတွက်စေရန်
    return { out, low, expired, soon, n };
  }

  /* ---------- drawer badge ---------- */
  function paintBadges(n) {
    const drawer = document.getElementById('drawer');
    if (!drawer) return;
    ['products', 'r-stock'].forEach(id => {
      const btn = drawer.querySelector(`.item[data-id="${id}"]`);
      if (!btn) return;
      let b = btn.querySelector('.ls-badge');
      if (!n) { if (b) b.remove(); return; }
      if (!b) {
        b = document.createElement('span');
        b.className = 'ls-badge';
        b.style.cssText = 'margin-left:auto;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:#dc2626;color:#fff;font-size:12px;font-weight:700;display:inline-grid;place-items:center;flex:none';
        const label = btn.querySelector('.label');
        if (label) label.after(b); else btn.appendChild(b);
      }
      b.textContent = n > 99 ? '99+' : n;
      b.title = 'ဖြည့်ရန်လိုသော ပစ္စည်း';
    });
  }

  /* ---------- toast-like bar ---------- */
  let bar = null, barTimer = 0;
  function showBar(html, href, ms) {
    if (!bar) {
      bar = document.createElement('div');
      bar.setAttribute('role', 'status');
      bar.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);z-index:9999;' +
        'display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:14px;background:#7f1d1d;color:#fff;' +
        'box-shadow:0 8px 24px rgba(0,0,0,.28);font:600 14px/1.5 "Noto Sans Myanmar",system-ui,sans-serif;max-width:560px;margin:0 auto';
      document.body.appendChild(bar);
    }
    bar.innerHTML = `<a style="flex:1;color:inherit;text-decoration:none">${html}</a>` +
      `<button aria-label="ပိတ်ရန်" style="border:0;background:transparent;color:inherit;font-size:20px;line-height:1;padding:4px 8px;cursor:pointer">×</button>`;
    bar.firstChild.href = href;
    bar.lastChild.onclick = hideBar;
    bar.style.display = 'flex';
    clearTimeout(barTimer);
    barTimer = setTimeout(hideBar, ms || 9000);
  }
  function hideBar() { if (bar) bar.style.display = 'none'; }

  /* ---------- public API ---------- */
  window.POSLowStock = {
    summary,
    refreshBadges: async () => paintBadges((await summary()).n),
    // retail.html မှ ရောင်းပြီးနောက် ခေါ်သည်: changed = stock လျော့ပြီးသော ပစ္စည်း object များ
    afterSale(changed) {
      const hit = (changed || []).filter(p => isOut(p) && Number(p.minStock) > 0 || isLow(p));
      if (!hit.length) { this.refreshBadges(); return; }
      const names = hit.slice(0, 3).map(p => `${esc(p.nameMm || p.name)} (${p.stock > 0 ? qty(p.stock) + ' ကျန်' : 'ကုန်'})`).join('၊ ');
      const more = hit.length > 3 ? ` နှင့် အခြား ${hit.length - 3} မျိုး` : '';
      showBar(`⚠ လက်ကျန်နည်းသွားပြီ - ${names}${more}`, 'products.html?status=low', 10000);
      this.refreshBadges();
    },
  };

  /* ---------- boot ---------- */
  async function boot() {
    const s = await summary();
    paintBadges(s.n);
    const drawer = document.getElementById('drawer');
    if (drawer) new MutationObserver(() => paintBadges(s.n)).observe(drawer, { childList: true });

    const onSummary = (document.body.dataset.page || '') === 'summary';
    let seen = false;
    try { seen = sessionStorage.getItem('ls-seen') === '1'; } catch (e) {}
    if (onSummary && s.n && !seen) {
      try { sessionStorage.setItem('ls-seen', '1'); } catch (e) {}
      const parts = [];
      if (s.low.length) parts.push(`လက်ကျန်နည်း ${s.low.length} မျိုး`);
      if (s.out.length) parts.push(`ကုန်နေ ${s.out.length} မျိုး`);
      if (s.expired.length) parts.push(`ရက်ကုန်ပြီး ${s.expired.length} မျိုး`);
      if (s.soon.length) parts.push(`ရက်ကုန်ခါနီး ${s.soon.length} မျိုး`);
      const stockIssue = s.low.length || s.out.length;      // လက်ကျန်ပြဿနာ မရှိဘဲ ရက်ကုန်မှုသာရှိလျှင် ရက်ကုန်စာရင်းသို့ တန်းသွားမည်
      showBar(`⚠ ${parts.join(' · ')} — နှိပ်ကြည့်ရန်`, stockIssue ? 'products.html?status=low' : 'products.html?status=exp', 10000);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
