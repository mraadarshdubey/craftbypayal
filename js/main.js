/* Navigation must be interactive before any catalogue request completes. */
const CBP_DRAWERS = (() => {
  const menu = document.querySelector('[data-drawer]');
  const cart = document.querySelector('[data-cart]');
  const timers = new WeakMap();
  let active = null, lastFocus = null;
  const focusables = el => [...el.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(n => n.getClientRects().length);
  const expanded = (el, value) => document.querySelectorAll('[aria-controls="' + el.id + '"]').forEach(b => b.setAttribute('aria-expanded', String(value)));
  if (menu) {
    menu.setAttribute('role', 'dialog');
    menu.setAttribute('aria-modal', 'true');
    menu.setAttribute('aria-label', 'Mobile menu');
  }
  function close(el, restoreFocus = true) {
    if (!el || el.hidden || active !== el) return;
    active = null;
    el.classList.remove('is-open');
    expanded(el, false);
    const finish = () => {
      el.hidden = true;
      timers.delete(el);
      if (!active) document.body.classList.remove('lock');
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) finish();
    else timers.set(el, setTimeout(finish, 300));
    if (restoreFocus && lastFocus?.isConnected) lastFocus.focus();
  }
  function open(el, trigger) {
    if (!el || active === el) return;
    if (active) close(active, false);
    clearTimeout(timers.get(el));
    timers.delete(el);
    lastFocus = trigger || document.activeElement;
    active = el;
    el.hidden = false;
    document.body.classList.add('lock');
    expanded(el, true);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (active === el) el.classList.add('is-open');
    }));
    focusables(el)[0]?.focus();
  }
  document.addEventListener('click', e => {
    const trigger = e.target.closest('[data-open-drawer]');
    if (trigger) open(menu, trigger);
    else if (e.target.closest('[data-close-drawer]')) close(menu);
    else if (e.target.closest('[data-open-cart]')) open(cart, e.target.closest('[data-open-cart]'));
    else if (e.target.closest('[data-close-cart]')) close(cart);
  });
  document.addEventListener('keydown', e => {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); close(active); return; }
    if (e.key !== 'Tab') return;
    const items = focusables(active), first = items[0], last = items[items.length - 1];
    if (!first) { e.preventDefault(); return; }
    if (e.shiftKey && (document.activeElement === first || !active.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && (document.activeElement === last || !active.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
  });
  return { open, close };
})();

window.CBP_READY = (async () => {
  try { await window.CBP_CATALOG_READY; } catch (err) { console.error('Catalogue unavailable, using bundled products', err); }
  'use strict';

  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const products = window.CBP_PRODUCTS || [];          // homepage favourites
  const catalog = window.CBP_CATALOG || [];             // full catalogue (shared across pages)
  const siteRoot=new URL('../',document.querySelector('script[src$="main.js"]').src);
  const types=window.CBP_GIFT_TYPES.filter(t=>t.enabled&&catalog.some(p=>p.collection===t.id));
  const giftLink=t=>new URL('collections/all.html?giftType='+encodeURIComponent(t.id),siteRoot).href;
  $$('[data-gift-type-cards]').forEach(grid=>{grid.innerHTML=types.map(t=>{const first=catalog.find(p=>p.collection===t.id);return `<li><a class="col-card" href="${giftLink(t)}" style="--accent:#E7DCCB"><span class="col-card__media"><img src="${esc(t.image||first.image)}" alt="${esc(t.imageAlt||first.alt||t.name)}" width="600" height="450" loading="lazy"></span><span class="col-card__label">${esc(t.name)} <span class="circle" aria-hidden="true">→</span></span></a></li>`;}).join('');});
  const byId = Object.fromEntries([...catalog, ...products].map(p => [p.id, p]));
  const inr = n => '₹' + n.toLocaleString('en-IN');
  const FREE_SHIP = window.CBP_SHIPPING?.freeAbove ?? 999;
  const SHIP_FEE = window.CBP_SHIPPING?.fee ?? 99; // TODO: confirm Craft by Payal's shipping fee for orders under ₹999

  const store = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* storage unavailable */ }
    }
  };

  // Cart keys are "<product-id>" (quick add, lowest price) or "<product-id>::<variant-index>" (from a product page).
  let cart = store.get('cbp-cart', {});   // { key: qty }
  let notes = store.get('cbp-notes', {}); // { key: personalisation summary }
  let wish = new Set(store.get('cbp-wish', []));
  let snapshots=store.get('cbp-cart-snapshots',{});
  const line = key => {
    const [id, variantKey] = key.split('::');
    const p=byId[id],saved=snapshots[key];
    if(p?.listingState==='preview')return {key,id,p,price:0,variant:'Preview only — remove to continue',variantId:'',unresolved:true,notOrderable:true};
    const v=p?.variants ? (variantKey===undefined?p.variants.find(v=>v.available):
      (p.variants.find(v=>v.id===(saved?.variantId||variantKey))||(/^\d+$/.test(variantKey)?p.variants.find(v=>v.id===id+'-v'+variantKey)||(!p.variants.some(v=>v.id)?p.variants[+variantKey]:null):null))):null;
    // A missing catalogue record is not permission to delete a customer's cart.
    if(!p || (variantKey!==undefined&&!v)){
      const fallback=saved?.p||{id,name:'Gift awaiting product details',image:new URL('../assets/og-image.png',document.querySelector('script[src$="main.js"]').src).href,price:0,managed:true};
      return {key,id,p:fallback,price:saved?.price||0,variant:saved?.variant||'',variantId:saved?.variantId||'',unresolved:true};
    }
    const item={key,id,p,price:v?v.price:p.price,variant:v?[v.size,v.light].filter(Boolean).join(' · '):'',variantId:v?.id||'',unresolved:false,notOrderable:!window.CBP_CAN_ORDER(p)};
    snapshots[key]={p:{id:p.id,name:p.name,image:p.image,price:item.price,managed:p.managed},price:item.price,variant:item.variant,variantId:item.variantId};
    return item;
  };
  const yearEl = $('[data-year]');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- Toast ---------- */
  const toastEl = $('[data-toast]');
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
  }

  function bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  /* ---------- Products ---------- */
  const stars = rating => {
    const full = Math.round(rating);
    return `<span class="stars" aria-hidden="true">${'<svg><use href="#i-star"/></svg>'.repeat(full)}</span>`;
  };

  function renderProducts() {
    const list = $('[data-products]');
    if (!list || !products.length) return;
    list.innerHTML = products.map(p => {
      const w = src => window.CBP_IMAGE(p.image,src);
      const pressed = wish.has(p.id);
      return `
      <li class="product">
        <a class="product__media" href="${window.CBP_PRODUCT_URL(p)}" tabindex="-1" aria-hidden="true">
          <img loading="lazy" width="400" height="400" src="${w(400)}" srcset="${w(300)} 300w, ${w(400)} 400w, ${w(600)} 600w"
               sizes="(min-width: 1200px) 250px, (min-width: 768px) 30vw, 46vw" alt="${esc(p.alt)}">
        </a>
        <button class="product__wish" type="button" data-wish="${p.id}" aria-pressed="${pressed}"
                aria-label="${pressed ? 'Remove' : 'Add'} ${esc(p.name)} ${pressed ? 'from' : 'to'} wishlist">
          <svg aria-hidden="true"><use href="#i-heart"/></svg>
        </button>
        <div class="product__body">
          <h3 class="product__name"><a href="${window.CBP_PRODUCT_URL(p)}">${esc(p.name)}</a></h3>
          ${p.reviews ? `<p class="product__rating">${stars(p.rating)}<span><span class="visually-hidden">Rated ${p.rating} out of 5, </span>(${p.reviews}<span class="visually-hidden"> reviews</span>)</span></p>` : ''}
          ${p.inStock ? '' : '<p class="stock">Out of stock</p>'}
          <div class="product__foot">
            <p class="price"><span class="visually-hidden">Price </span>${inr(p.price)}${p.compareAt ? `<s><span class="visually-hidden">was </span>${inr(p.compareAt)}</s>` : ''}</p>
            <button class="add-btn" type="button" data-add="${p.id}" aria-label="Add ${esc(p.name)} to cart" ${p.inStock ? '' : 'disabled'}>
              <svg aria-hidden="true"><use href="#i-cart"/></svg>
            </button>
          </div>
        </div>
      </li>`;
    }).join('');
  }

  /* ---------- Wishlist ---------- */
  const wishCount = $('[data-wish-count]');
  function syncWish() {
    store.set('cbp-wish', [...wish]);
    wishCount.textContent = wish.size;
    wishCount.hidden = wish.size === 0;
  }
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-wish]');
    if (!btn) return;
    const id = btn.dataset.wish, p = byId[id];
    const on = !wish.has(id);
    on ? wish.add(id) : wish.delete(id);
    btn.setAttribute('aria-pressed', on);
    btn.setAttribute('aria-label', `${on ? 'Remove' : 'Add'} ${esc(p.name)} ${on ? 'from' : 'to'} wishlist`);
    btn.classList.remove('pulse'); void btn.offsetWidth; btn.classList.add('pulse');
    syncWish(); bump(wishCount);
    toast(on ? 'Saved to your wishlist' : 'Removed from wishlist');
  });

  /* Catalogue-dependent cart rendering starts only after the catalogue resolves. */
  const { open: openDrawer, close: closeDrawer } = CBP_DRAWERS;
  const cartDrawer = $('[data-cart]');
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSearch(); closeMenus(); }
  });

  /* ---------- Cart ---------- */
  const cartCount = $('[data-cart-count]');
  const cartListeners = [];
  function renderCart() {
    store.set('cbp-cart', cart);
    cartListeners.forEach(fn => fn());
    store.set('cbp-notes', notes);
    const lines = Object.keys(cart).map(line).filter(Boolean);
    snapshots=Object.fromEntries(Object.entries(snapshots).filter(([key])=>cart[key]));
    store.set('cbp-cart-snapshots',snapshots);
    const count = lines.reduce((n, l) => n + cart[l.key], 0);
    const total = lines.reduce((n, l) => n + cart[l.key] * l.price, 0);
    cartCount.textContent = count;
    cartCount.hidden = count === 0;
    $('[data-cart-empty]').hidden = count > 0;
    $('[data-cart-foot]').hidden = count === 0;
    $('[data-cart-total]').textContent = inr(total);
    $('[data-cart-ship]').textContent = total >= FREE_SHIP
      ? 'You’ve unlocked free shipping ✶'
      : `Add ${inr(FREE_SHIP - total)} more for free shipping (otherwise ${inr(SHIP_FEE)})`;
    const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    $('[data-cart-items]').innerHTML = lines.map(({ key, p, price, variant, notOrderable }) => `<li class="cart-item">
        <img src="${window.CBP_IMAGE(p.image,160)}" alt="" width="76" height="76">
        <div>
          <p class="cart-item__name">${esc(p.name)}</p>
          ${variant ? `<p class="cart-item__variant">${esc(variant)}</p>` : ''}
          ${notes[key] ? `<p class="cart-item__note">${esc(notes[key])}</p>` : ''}
          <p class="cart-item__price">${notOrderable?"Unavailable to order":inr(price)}</p>
          <div class="qty" role="group" aria-label="Quantity for ${esc(p.name)}">
            <button type="button" data-qty="${key}" data-d="-1" aria-label="Decrease quantity">−</button>
            <span aria-live="polite">${cart[key]}</span>
            <button type="button" data-qty="${key}" data-d="1" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <button class="cart-item__remove" type="button" data-remove="${key}" aria-label="Remove ${esc(p.name)}"><svg aria-hidden="true"><use href="#i-close"/></svg></button>
      </li>`).join('');
  }
  document.addEventListener('click', e => {
    const add = e.target.closest('[data-add]');
    if (add) {
      let id = add.dataset.add;
      const quick=byId[id]?.variants?.find(v=>v.available);
      if(quick?.id)id+='::'+quick.id;
      if (!window.CBP_CAN_ORDER(byId[id.split('::')[0]])) { toast('This gift is currently unavailable.'); return; }
      cart[id] = (cart[id] || 0) + 1;
      renderCart(); bump(cartCount);
      const icon = add.querySelector('use');
      add.classList.add('added');
      icon && icon.setAttribute('href', '#i-check');
      setTimeout(() => { add.classList.remove('added'); icon && icon.setAttribute('href', '#i-cart'); }, 1000);
      toast(`${byId[id.split('::')[0]].name} added to cart`);
      return;
    }
    const q = e.target.closest('[data-qty]');
    if (q) {
      const id = q.dataset.qty;
      cart[id] += Number(q.dataset.d);
      if (cart[id] <= 0) { delete cart[id]; delete notes[id]; }
      renderCart();
      const again = $(`[data-qty="${id}"][data-d="${q.dataset.d}"]`);
      again ? again.focus() : $('[data-close-cart].icon-btn').focus();
      return;
    }
    const rm = e.target.closest('[data-remove]');
    if (rm) { delete cart[rm.dataset.remove]; delete notes[rm.dataset.remove]; renderCart(); $('[data-close-cart].icon-btn').focus(); }
  });

  /* ---------- Desktop dropdowns ---------- */
  const menus = $$('.has-menu');
  function closeMenus(except) {
    menus.forEach(m => { if (m !== except) { m.classList.remove('open'); $('button', m).setAttribute('aria-expanded', 'false'); } });
  }
  menus.forEach(m => {
    const b = $('button', m);
    b.addEventListener('click', () => {
      const open = !m.classList.contains('open');
      closeMenus(m);
      m.classList.toggle('open', open);
      b.setAttribute('aria-expanded', open);
    });
    m.addEventListener('mouseenter', () => b.setAttribute('aria-expanded', 'true'));
    // leaving the menu with the pointer always closes it (and drops any click focus so it can't stay open)
    m.addEventListener('mouseleave', () => {
      m.classList.remove('open');
      b.setAttribute('aria-expanded', 'false');
      if (m.contains(document.activeElement) && !document.activeElement.matches(':focus-visible')) document.activeElement.blur();
    });
  });
  document.addEventListener('click', e => { if (!e.target.closest('.has-menu')) closeMenus(); });
  menus.forEach(m => m.addEventListener('focusout', e => { if (!m.contains(e.relatedTarget)) closeMenus(); }));

  /* ---------- Search ---------- */
  const search = $('[data-search]');
  function closeSearch() { if (!search.hidden) { search.hidden = true; $('[data-open-search]').focus(); } }
  $('[data-open-search]').addEventListener('click', () => {
    search.hidden = !search.hidden;
    if (!search.hidden) $('#q').focus();
  });
  $('[data-close-search]').addEventListener('click', closeSearch);
  // The search form submits natively (GET ?q=) to the collection page, which filters by the term.

  /* ---------- Sticky nav state ---------- */
  const nav = $('[data-nav]');
  const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 30);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* ---------- Reviews carousel ---------- */
  const track = $('[data-rv-track]');
  if (track) {
    const step = dir => {
      const card = $('.review', track);
      const gap = parseFloat(getComputedStyle(track).columnGap) || 24;
      track.scrollBy({ left: dir * (card.offsetWidth + gap), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    };
    $('[data-rv-prev]').addEventListener('click', () => step(-1));
    $('[data-rv-next]').addEventListener('click', () => step(1));
  }

  /* ---------- Newsletter ---------- */
  const nl = $('[data-newsletter]');
  nl && nl.addEventListener('submit', e => {
    e.preventDefault();
    const input = $('input', nl), msg = $('[data-newsletter-msg]');
    if (!input.checkValidity() || !input.value.trim()) {
      msg.textContent = 'Please enter a valid email address.';
      input.setAttribute('aria-invalid', 'true');
      input.focus();
      return;
    }
    input.removeAttribute('aria-invalid');
    // TODO: connect to the email provider (Shopify customer API / Klaviyo) before launch.
    msg.textContent = 'Email updates are not available yet. Please contact the studio on WhatsApp.';
    nl.reset();
  });

  /* ---------- Footer accordions: collapsed on phones ---------- */
  const phone = matchMedia('(max-width: 767px)');
  const syncFooter = () => $$('.footer__col[open], details.footer__col').forEach(d => { d.open = !phone.matches; });
  phone.addEventListener('change', syncFooter);
  syncFooter();

  renderProducts();
  syncWish();
  renderCart();

  // Small API for page scripts (e.g. collection.js)
  window.CBP = {
    inr, toast, byId,
    isWished: id => wish.has(id),
    wishlist: () => [...wish],
    addToCart(key, qty = 1, note = '') {
      const item=line(key);
      if(!item || !window.CBP_CAN_ORDER(item.p) || item.unresolved || (key.includes('::') && !item.p.variants?.find((v,i)=>v.id===key.split('::')[1]||String(i)===key.split('::')[1])?.available))return;
      cart[key] = (cart[key] || 0) + qty;
      if (note) notes[key] = note;
      renderCart(); bump(cartCount);
    },
    openCart: () => openDrawer(cartDrawer, $('[data-open-cart]')),
    // ---- used by cart / checkout pages ----
    FREE_SHIP, SHIP_FEE,
    cartLines: () => Object.keys(cart).map(line).filter(Boolean).map(l => ({ ...l, qty: cart[l.key], note: notes[l.key] || '' })),
    totals() {
      const lines = this.cartLines();
      const subtotal = lines.reduce((n, l) => n + l.qty * l.price, 0);
      const shipping = !subtotal || subtotal >= FREE_SHIP ? 0 : SHIP_FEE;
      return { count: lines.reduce((n, l) => n + l.qty, 0), subtotal, shipping, total: subtotal + shipping };
    },
    setQty(key, qty) { if (qty <= 0) { delete cart[key]; delete notes[key]; } else cart[key] = qty; renderCart(); },
    setNote(key, note) { if (note) notes[key] = note; else delete notes[key]; renderCart(); },
    clearCart() { cart = {}; notes = {}; renderCart(); },
    onCartChange(fn) { cartListeners.push(fn); }
  };
})();
