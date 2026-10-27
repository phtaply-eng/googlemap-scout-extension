/* ============================================================
   Taply Scout — popup.js
   - getBusinessTheme(): category → color engine
   - Renders scraped data (Apple frosted UI, light/dark)
   - Exports MD / TXT, builds smart-themed VS Code + OpenCode
     landing page prompts. 100% client-side.
   ============================================================ */

const $id = (id) => document.getElementById(id);

const els = {
  status: $id('statusLine'), stale: $id('staleBar'), staleAge: $id('staleAge'),
  content: $id('content'), empty: $id('empty'),
  emptyTitle: $id('emptyTitle'), emptyText: $id('emptyText'), btnRetry: $id('btnRetry'),
  avatar: $id('avatar'), bizName: $id('bizName'), bizBadge: $id('bizBadge'), bizPill: $id('bizPill'),
  starGlyphs: $id('starGlyphs'), starCount: $id('starCount'),
  themeDots: $id('themeDots'), themeDetected: $id('themeDetected'), themeName: $id('themeName'),
  fieldsList: $id('fieldsList'), socialsRow: $id('socialsRow'),
  reviewsList: $id('reviewsList'), reviewsMeta: $id('reviewsMeta')
};

let currentData = null;
let currentTheme = null;
let currentTab = null;
let themeMode = 'system';
let lastScrapeTs = null;
let modalCtx = { title: '', body: '', filename: '', mime: '' };
let toastTimer = null;

/* ============================================================
   FEATURE 3 — SMART COLOR ENGINE
   ============================================================ */

function getBusinessTheme(category, subCategory) {
  const c = `${category || ''} ${subCategory || ''}`.toLowerCase();
  const has = (...keys) => keys.some((k) => c.includes(k));

  if (has('dental', 'dentist', 'orthodont')) {
    return {
      name: 'Dental Blue & White',
      colors: { brand: '#0B63CE', brandDeep: '#1976D2', brandLight: '#EFF7FF', ink: '#102A43', sand: '#FCFAF6', accent: '#F4B740' },
      tailwind: { brand: '#0B63CE', deep: '#1976D2', light: '#EFF7FF', ink: '#102A43', sand: '#FCFAF6', gold: '#F4B740' }
    };
  }
  if (has('barber', 'tattoo', 'hair', 'shaving') && !has('clinic', 'medical', 'surgery', 'transplant')) {
    return {
      name: 'Black & White Premium',
      colors: { brand: '#111111', brandDeep: '#2A2A2A', brandLight: '#F5F5F5', ink: '#111111', sand: '#FAFAFA', accent: '#C5A46A' },
      tailwind: { brand: '#111111', deep: '#2A2A2A', light: '#F5F5F5', ink: '#111111', sand: '#FAFAFA', gold: '#C5A46A' }
    };
  }
  if (has('restaurant', 'cafe', 'café', 'coffee', 'bistro', 'bakery', 'diner', 'eatery')) {
    return {
      name: 'Warm Earth',
      colors: { brand: '#B45309', brandDeep: '#D97706', brandLight: '#FEF3C7', ink: '#422006', sand: '#FFFBEB', accent: '#D97706' },
      tailwind: { brand: '#B45309', deep: '#D97706', light: '#FEF3C7', ink: '#422006', sand: '#FFFBEB', gold: '#F4B740' }
    };
  }
  if (has('gym', 'fitness', 'crossfit', 'boxing', 'muay thai', 'martial arts')) {
    return {
      name: 'Energy Black & Red',
      colors: { brand: '#DC2626', brandDeep: '#991B1B', brandLight: '#FEF2F2', ink: '#111111', sand: '#FAFAFA', accent: '#DC2626' },
      tailwind: { brand: '#DC2626', deep: '#991B1B', light: '#FEF2F2', ink: '#111111', sand: '#FAFAFA', accent: '#DC2626' }
    };
  }
  if (has('spa', 'massage', 'wellness', 'beauty', 'nail', 'facial', 'aesthetic')) {
    return {
      name: 'Soft Sage & Blush',
      colors: { brand: '#6B8E6B', brandDeep: '#87A987', brandLight: '#F0F5F0', ink: '#2D3A2D', sand: '#F8FAF7', accent: '#F4C2C2' },
      tailwind: { brand: '#6B8E6B', deep: '#87A987', light: '#F0F5F0', ink: '#2D3A2D', sand: '#F8FAF7', blush: '#F4C2C2' }
    };
  }
  if (has('clinic', 'medical', 'doctor', 'vet', 'hospital', 'health center')) {
    return {
      name: 'Clean Medical Blue',
      colors: { brand: '#0891B2', brandDeep: '#0E7490', brandLight: '#ECFEFF', ink: '#164E63', sand: '#F8FEFE', accent: '#22B8CF' },
      tailwind: { brand: '#0891B2', deep: '#0E7490', light: '#ECFEFF', ink: '#164E63', sand: '#F8FEFE', accent: '#22B8CF' }
    };
  }
  if (has('law', 'lawyer', 'attorney', 'accounting', 'accountant', 'real estate', 'realty', 'insurance', 'consultanc')) {
    return {
      name: 'Navy Trust',
      colors: { brand: '#1E3A8A', brandDeep: '#1E40AF', brandLight: '#EFF6FF', ink: '#172554', sand: '#F8FAFF', accent: '#3B82F6' },
      tailwind: { brand: '#1E3A8A', deep: '#1E40AF', light: '#EFF6FF', ink: '#172554', sand: '#F8FAFF', accent: '#3B82F6' }
    };
  }
  return {
    name: 'Charcoal & Mint',
    colors: { brand: '#111827', brandDeep: '#1F2937', brandLight: '#F3F4F6', ink: '#111827', sand: '#FCFAF6', accent: '#10B981' },
    tailwind: { brand: '#111827', deep: '#1F2937', light: '#F3F4F6', ink: '#111827', sand: '#FCFAF6', mint: '#10B981', gold: '#D4AF37' }
  };
}

/* ============================================================
   Small utilities
   ============================================================ */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slug(name) {
  return String(name || 'business')
    .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'business';
}

function leadInfo(d) {
  if (!d.website) return { label: 'No Website • Good Lead', score: 'High', cls: 'lead (labelled below)' };
  if (d.websiteIsSocial) return { label: 'Social Page Only • Good Lead', score: 'Medium', cls: 'lead-soft' };
  return { label: 'Has Website', score: 'Low', cls: 'has' };
}

function starsGlyphs(rating) {
  const n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

function relTime(ts) {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function setStatus(text) {
  if (!els.status) return;
  if (!text) { els.status.hidden = true; return; }
  els.status.textContent = text;
  els.status.hidden = false;
}

function toast(text) {
  const t = $id('toast');
  if (!t) return;
  t.textContent = text;
  t.hidden = false;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => { t.hidden = true; }, 250);
  }, 1700);
}

function copyToClipboard(text, msg = 'Copied!') {
  const fallback = () => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;top:0;left:0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); toast(msg); } catch (e) { toast('Copy failed — select & copy manually'); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(msg), fallback);
  } else fallback();
}

function downloadBlob(text, filename, mime) {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function showPreview(title, body, filename, mime) {
  modalCtx = { title, body, filename, mime };
  $id('modalTitle').textContent = title;
  $id('modalBody').textContent = body;
  $id('modal').hidden = false;
}

function closeModal() { $id('modal').hidden = true; }

/* ============================================================
   FEATURE 1/2 — scrape + render
   ============================================================ */

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs && tabs[0] ? tabs[0] : null;
}

function isMapsTab(tab) {
  return !!(tab && tab.url && /https:\/\/www\.google\.[a-z.]+\/maps/i.test(tab.url));
}

function sendScrape(tabId) {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => { if (!done) { done = true; resolve({ ok: false, error: 'TIMEOUT' }); } }, 35000);
    try {
      chrome.tabs.sendMessage(tabId, { type: 'TAPLY_SCOUT_SCRAPE' }, (resp) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (chrome.runtime.lastError) resolve(null);
        else resolve(resp);
      });
    } catch (e) {
      clearTimeout(timer);
      resolve(null);
    }
  });
}

async function injectContent(tabId) {
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
    await sleep(600);
  } catch (e) { /* permission or wrong host */ }
}

async function getBusinessInfo(tab) {
  els.empty.hidden = true;
  els.content.hidden = true;
  els.stale.hidden = true;
  setStatus('Scraping… scrolling reviews can take a few seconds');
  try {
    let resp = await sendScrape(tab.id);
    if (!resp) {
      await injectContent(tab.id);
      resp = await sendScrape(tab.id);
    }
    if (!resp || !resp.ok) return handleError(resp);
    currentData = resp.data;
    currentTheme = getBusinessTheme(currentData.category, currentData.subCategory);
    lastScrapeTs = Date.now();
    await chrome.storage.local.set({ lastScrape: { data: currentData, savedAt: lastScrapeTs } });
    render(currentData, { stale: false });
    chrome.runtime.sendMessage({ type: 'TAPLY_SCOUT_COUNTED' }).catch(() => {});
  } catch (e) {
    handleError(null, e);
  }
  setStatus('');
}

function handleError(resp, err) {
  const code = resp && resp.error ? String(resp.error) : '';
  els.empty.hidden = false;
  els.content.hidden = true;
  els.stale.hidden = true;
  if (code === 'NO_BUSINESS') {
    els.emptyTitle.textContent = 'Open a business on Google Maps first';
    els.emptyText.textContent = 'No place panel was found. Search for a business and click it so the left panel shows its name, address and rating.';
  } else if (code === 'TIMEOUT') {
    els.emptyTitle.textContent = 'The page took too long to respond';
    els.emptyText.textContent = 'Refresh the Google Maps tab, click the business again, then press Get Info.';
  } else {
    els.emptyTitle.textContent = 'Could not reach the Maps tab';
    els.emptyText.textContent = 'Refresh the tab (F5), make sure it is a Google Maps place page, then press Get Info again.' +
      (code ? ` (${code})` : (err ? ` (${(err && err.message) || err})` : ''));
  }
}

async function showStoredOrEmpty() {
  const { lastScrape } = await chrome.storage.local.get('lastScrape');
  if (lastScrape && lastScrape.data) {
    currentData = lastScrape.data;
    currentTheme = getBusinessTheme(currentData.category, currentData.subCategory);
    lastScrapeTs = lastScrape.savedAt || Date.now();
    render(currentData, { stale: true });
  } else {
    els.empty.hidden = false;
    els.content.hidden = true;
  }
}

/* ---------- render ---------- */

function render(d, opts) {
  const opts_ = opts || {};
  const lead = leadInfo(d);
  const theme = currentTheme || getBusinessTheme(d.category, d.subCategory);

  els.empty.hidden = true;
  els.content.hidden = false;
  els.stale.hidden = !opts_.stale;
  if (opts_.stale && els.staleAge) els.staleAge.textContent = relTime(lastScrapeTs || Date.now());

  // Hero
  els.avatar.textContent = (d.businessName || 'B').trim().charAt(0).toUpperCase() || 'B';
  els.avatar.style.setProperty('--avatar-a', theme.colors.brand);
  els.avatar.style.setProperty('--avatar-b', theme.colors.accent || theme.colors.brandDeep || '#5AC8FA');
  els.bizName.textContent = d.businessName || 'Unnamed place';
  els.bizName.title = d.businessName || '';
  els.bizBadge.textContent = d.category || 'Business';
  els.bizPill.textContent = lead.label;
  els.bizPill.className = 'pill' + (lead.score !== 'Low' ? ' lead' : '');
  els.starGlyphs.textContent = starsGlyphs(d.rating);
  els.starCount.textContent = `${d.rating != null ? d.rating.toFixed(1) : '—'} (${d.reviewCount != null ? d.reviewCount : 0}${d.reviewCount <= 15 && d.reviews ? ' collected' : ''})`;

  // Theme row
  els.themeDetected.textContent = `Detected: ${d.category || 'Business'} → Using ${theme.name} theme`;
  els.themeName.textContent = `brand ${theme.colors.brand} · accent ${theme.colors.accent || '—'} · light ${theme.colors.brandLight}`;
  const dots = els.themeDots ? Array.from(els.themeDots.querySelectorAll('i')) : [];
  if (dots.length >= 3) {
    dots[0].style.background = theme.colors.brand;
    dots[1].style.background = theme.colors.accent || theme.colors.brandDeep || theme.colors.gold || '#F4B740';
    dots[2].style.background = theme.colors.brandLight || theme.colors.sand || '#FFFFFF';
  }

  // Fields
  els.fieldsList.textContent = '';
  const hours = (d.openingHours || []).slice(0, 7).join(' · ');
  const rows = [
    ['Address', d.address || '—', d.address ? 'strong' : ''],
    ['City', d.city || '—', ''],
    ['Phone', d.phone || '—', ''],
    ['Website', d.website ? null : 'None', d.website ? 'link' : 'warn'],
    ['Lead Score', `${lead.score}${d.website ? '' : ' — No website'}`, 'strong'],
    ['Rating', d.rating != null ? `${d.rating} ★ (${d.reviewCount || 0} reviews)` : '—', ''],
    ['Price Level', d.priceLevel || '—', ''],
    ['Open Now', d.isOpenNow == null ? '—' : (d.isOpenNow ? 'Yes' : 'No'), d.isOpenNow === true ? 'strong' : ''],
    ['Hours', hours || d.openStatusText || '—', ''],
    ['Plus Code', d.plusCode || '—', 'mono'],
    ['Photos', d.photosCount != null ? String(d.photosCount) : '—', ''],
    ['Place ID', d.placeId || '—', 'mono'],
    ['Maps URL', 'Open listing ↗', 'link']
  ];
  for (const [k, v, cls] of rows) {
    const row = document.createElement('div');
    row.className = 'frow';
    const kk = document.createElement('div');
    kk.className = 'k';
    kk.textContent = k;
    const vv = document.createElement('div');
    vv.className = 'v' + (cls ? ' ' + cls : '');
    if (k === 'Website' && d.website) {
      const a = document.createElement('a');
      a.href = d.website;
      a.textContent = shorten(d.website, 44);
      a.target = '_blank';
      a.rel = 'noopener';
      vv.appendChild(a);
    } else if (k === 'Maps URL') {
      const a = document.createElement('a');
      a.href = d.googleMapsUrl || '#';
      a.textContent = v;
      a.target = '_blank';
      a.rel = 'noopener';
      vv.appendChild(a);
    } else {
      vv.textContent = v;
    }
    row.appendChild(kk);
    row.appendChild(vv);
    els.fieldsList.appendChild(row);
  }

  // Socials chips
  els.socialsRow.hidden = true;
  els.socialsRow.textContent = '';
  const socials = d.socialLinks || [];
  if (socials.length) {
    for (const s of socials.slice(0, 6)) {
      const a = document.createElement('a');
      a.className = 'chip ' + (s.platform || 'other').toLowerCase().replace(/[^a-z]+/g, '');
      a.href = s.url;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = s.platform;
      els.socialsRow.appendChild(a);
    }
    els.socialsRow.hidden = false;
  }

  // Reviews preview
  els.reviewsList.textContent = '';
  const revs = d.reviews || [];
  if (!revs.length) {
    const em = document.createElement('div');
    em.className = 'revEmpty';
    em.textContent = 'No reviews could be collected from this panel.';
    els.reviewsList.appendChild(em);
    els.reviewsMeta.textContent = '';
  } else {
    for (const r of revs.slice(0, 4)) {
      const item = document.createElement('div');
      item.className = 'rev';
      const head = document.createElement('div');
      head.className = 'revHead';
      const st = document.createElement('span');
      st.className = 'rStars';
      st.textContent = starsGlyphs(r.rating);
      const au = document.createElement('span');
      au.className = 'rAuthor';
      au.textContent = r.author || 'Google user';
      const dt = document.createElement('span');
      dt.className = 'rDate';
      dt.textContent = r.date || '';
      head.appendChild(st);
      head.appendChild(au);
      head.appendChild(dt);
      const tx = document.createElement('p');
      tx.className = 'rText';
      tx.textContent = r.text || '—';
      item.appendChild(head);
      item.appendChild(tx);
      els.reviewsList.appendChild(item);
    }
    if (revs.length > 4) els.reviewsMeta.textContent = `+ ${revs.length - 4} more in exports (${revs.length} collected)`;
    else els.reviewsMeta.textContent = `${revs.length} collected`;
  }

  for (const id of ['btnMd', 'btnTxt', 'btnVscode', 'btnOc']) $id(id).disabled = false;
}

function shorten(s, n) {
  s = String(s || '');
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

/* ============================================================
   FEATURE 4 — GROUP A: EXPORTS
   ============================================================ */

function exportMarkdown(d, theme) {
  const lead = leadInfo(d);
  const socials = d.socialLinks || [];
  const socialsLine = socials.length
    ? socials.map((s) => `${s.platform}: ${s.url}`).join(' · ')
    : 'None found';
  const hours = (d.openingHours || []).join(' · ') || d.openStatusText || 'Not listed';
  const L = [];
  L.push(`# ${d.businessName}`);
  L.push('');
  L.push(`**Category:** ${d.category || 'Business'}${d.subCategory ? ` (${d.subCategory})` : ''} → Theme: ${theme.name}`);
  L.push(`**Address:** ${d.address || '—'}`);
  if (d.city) L.push(`**City:** ${d.city}`);
  L.push(`**Phone:** ${d.phone || '—'}`);
  L.push(`**Website:** ${d.website || 'None'}`);
  L.push(`**Rating:** ${d.rating != null ? `${d.rating} ★ (${d.reviewCount || 0} reviews)` : '—'}`);
  if (d.priceLevel) L.push(`**Price Level:** ${d.priceLevel}`);
  L.push(`**Hours:** ${hours}`);
  if (d.isOpenNow != null) L.push(`**Open Now:** ${d.isOpenNow ? 'Yes' : 'No'}`);
  if (d.plusCode) L.push(`**Plus Code:** ${d.plusCode}`);
  L.push(`**Socials:** ${socialsLine}`);
  if (d.photosCount != null) L.push(`**Photos:** ${d.photosCount}`);
  L.push(`**Maps URL:** ${d.googleMapsUrl || '—'}`);
  if (d.placeId) L.push(`**Place ID:** ${d.placeId}`);
  L.push(`**Lead Score:** ${lead.score}${!d.website ? ' - No website' : ''}`);
  if (d.description) { L.push(''); L.push(`> ${d.description}`); }
  if ((d.services || []).length) { L.push(''); L.push(`**Services/Amenities:** ${d.services.join(', ')}`); }
  const revs = d.reviews || [];
  if (revs.length) {
    L.push('');
    L.push(`## Reviews (${revs.length})`);
    for (const r of revs) {
      const stars = r.rating != null ? r.rating : '?';
      L.push(`> ${stars}★ — ${r.author || 'Google user'}${r.date ? ` (${r.date})` : ''}`);
      L.push(`> ${r.text || '—'}`);
      L.push('');
    }
  }
  L.push('');
  L.push(`---`);
  L.push(`*Scraped ${relTime(lastScrapeTs || Date.now())} by Taply Scout • TapVinci 🇵🇭*`);
  return L.join('\n');
}

function exportTxt(d, theme) {
  return exportMarkdown(d, theme)
    .split('\n')
    .map((l) => {
      let s = l;
      s = s.replace(/^#+\s*/, '');
      s = s.replace(/\*\*(.+?)\*\*/g, '$1');
      s = s.replace(/^>\s?/, '');
      s = s.replace(/^-{3,}\s*$/, '—————————————');
      return s;
    })
    .join('\n');
}

function doExport(kind) {
  if (!currentData) return;
  const theme = currentTheme || getBusinessTheme(currentData.category, currentData.subCategory);
  const name = slug(currentData.businessName);
  const file = `${name}-tapvinci-scout.${kind}`;
  const body = kind === 'md' ? exportMarkdown(currentData, theme) : exportTxt(currentData, theme);
  showPreview(file, body, file, kind === 'md' ? 'text/markdown' : 'text/plain');
  downloadBlob(body, file, kind === 'md' ? 'text/markdown' : 'text/plain');
  toast(`Exported ${file}`);
}

/* ============================================================
   FEATURE 4 — GROUP B: SMART THEMED BUILDER PROMPTS
   ============================================================ */

function themeColorsForPrompt(theme) {
  return JSON.stringify(theme.tailwind && theme.tailwind.colors ? theme.tailwind.colors : theme.colors, null, 2);
}

function buildVSCodePrompt(d, theme) {
  const lead = leadInfo(d);
  const reviewsJson = JSON.stringify((d.reviews || []).slice(0, 15));
  const themeJson = themeColorsForPrompt(theme);
  const businessJson = JSON.stringify({
    name: d.businessName, category: d.category, subCategory: d.subCategory,
    address: d.address, city: d.city, phone: d.phone, website: d.website || null,
    rating: d.rating, reviewCount: d.reviewCount, priceLevel: d.priceLevel,
    openingHours: d.openingHours || [], openNow: d.isOpenNow, plusCode: d.plusCode,
    description: d.description || '', services: d.services || [],
    mapsUrl: d.googleMapsUrl, placeId: d.placeId,
    socialLinks: d.socialLinks || [], leadScore: lead.score
  });
  const socials = d.socialLinks || [];
  const socialsLine = socials.length ? socials.map((s) => `${s.platform}: ${s.url}`).join(', ') : 'NONE FOUND';
  const hoursLine = (d.openingHours || []).join(' | ') || d.openStatusText || 'Not listed — add a placeholder';

  const L = [];
  L.push('Build me a one-page website for this business using my reference structure.');
  L.push('');
  L.push('BUSINESS DATA:');
  L.push(`Name: ${d.businessName}`);
  L.push(`Category: ${d.category || 'Business'}${d.subCategory ? ` (${d.subCategory})` : ''}`);
  L.push(`Detected Theme: ${theme.name} -> Use exactly these colors:`);
  L.push(themeJson);
  L.push(`Address: ${d.address || '—'}`);
  L.push(`City: ${d.city || ''} | Phone: ${d.phone || '—'} | Price Level: ${d.priceLevel || '—'}`);
  L.push(`Website: ${d.website ? d.website : 'NONE - This is a lead, no website'}`);
  L.push(`Rating: ${d.rating != null ? d.rating : '—'} (${d.reviewCount || 0} reviews)`);
  L.push(`Reviews JSON: ${reviewsJson}`);
  L.push(`Hours: ${hoursLine}`);
  L.push(`Plus Code: ${d.plusCode || '—'}`);
  L.push(`City: ${d.city || '—'}`);
  L.push(`Maps URL: ${d.googleMapsUrl || '—'}`);
  L.push(`Place ID: ${d.placeId || '—'}`);
  L.push(`Social Links Found: ${socialsLine}`);
  L.push(`Description: ${d.description || '—'}`);
  L.push(`Services/Amenities: ${(d.services || []).join(', ') || '—'}`);
  L.push(`Lead Score: ${lead.score}${!d.website ? ' - No website detected' : ''}`);
  L.push('');
  L.push('DESIGN REQUIREMENTS:');
  L.push("1. THEME: Respectfully choose colors based on the business. Because the category is '" + (d.category || 'Business') + "', use the " + theme.name + ' theme with the exact colors above. DO NOT use generic colors. Dental = blue/white #0B63CE, Barber = black/white/gold, Restaurant = warm amber, Gym = black/red, Spa = sage/blush, Clinic = cyan blue, Services = navy.');
  L.push('2. FILES: Create index.html, style.css, details.js, script.js');
  L.push('   - index.html structure: Header, Hero with name + category + address + rating + Call + WhatsApp buttons, At a glance card, About, What to expect (analyze the reviews; if several reviews complain about the same thing, turn "What to expect" into an honest guide section), Services (3 cards built from the amenities/services above), Reviews (all reviews as cards), Contact with map iframe + Plus Code + Hours + Social Media Buttons, Footer saying "Preview built by TapVinci".');
  L.push('   - details.js: export const BUSINESS = ' + businessJson + ' and export const THEME = ' + themeJson + ' and a heroImage field (see requirement 3).');
  L.push('   - script.js: Inject the BUSINESS details into the page, apply THEME colors to CSS variables (document.documentElement.style.setProperty), render every review as a card, and render the social buttons.');
  L.push('   - style.css: Keep the Tailwind CDN config approach from my reference, but map its color tokens to the THEME values above. Keep these signature classes working: .paper (radial-gradient background built from THEME brand colors), .hero-grid, .soft-float, .map-frame.');
  L.push('3. IMAGE SUPPORT: Add a placeholder hero and about visual with the comment /* REPLACE: Upload business image here - Hero and About sections */. In the hero create <div id="hero-image" class="object-cover bg-center content-cover" style="background-image: var(--hero-image-url)"></div>. Allow the owner to set the image from details.js like this: heroImage: "images/storefront.jpg" — if heroImage is empty use a tasteful THEME-colored gradient placeholder.');
  L.push('4. SOCIAL MEDIA BUTTONS WITH OFFICIAL BRANDING — MANDATORY (only for links that exist above):');
  L.push('   - Facebook: solid #1877F2 background, white text + icon');
  L.push('   - Instagram: gradient #F58529 -> #DD2A7B -> #515BD4, white text');
  L.push('   - TikTok: black #000000 background with white icon');
  L.push('   - WhatsApp: #25D366 background, white icon, links to wa.me using the business phone if no explicit link exists');
  L.push('   - Google Maps: white background with the multicolor Google pin icon, links to the Maps URL');
  L.push('   All social buttons: rounded-full, 44px height, Apple-style spacing, hover:-translate-y-0.5 transition.');
  if (!d.website) L.push('5. Add a visible orange badge near the hero: "No Website Detected - We built this from Google listing" / Lead: High. It sells my TapVinci service when I show it to the owner.');
  else L.push('5. Add a subtle badge linking to the existing website for reference during the pitch.');
  L.push('');
  L.push('Return FULL file contents — one code block per file: index.html, style.css, details.js, script.js.');
  return L.join('\n');
}

function buildOpenCodePrompt(d, theme) {
  const lead = leadInfo(d);
  const reviewsJson = JSON.stringify((d.reviews || []).slice(0, 15));
  const themeJson = themeColorsForPrompt(theme);
  const businessJson = JSON.stringify({
    name: d.businessName, category: d.category, subCategory: d.subCategory,
    address: d.address, city: d.city, phone: d.phone, website: d.website || null,
    rating: d.rating, reviewCount: d.reviewCount, priceLevel: d.priceLevel,
    openingHours: d.openingHours || [], openNow: d.isOpenNow, plusCode: d.plusCode,
    description: d.description || '', services: d.services || [],
    mapsUrl: d.googleMapsUrl, placeId: d.placeId,
    socialLinks: d.socialLinks || [], leadScore: lead.score, reviews: (d.reviews || []).slice(0, 15)
  }, null, 2);
  const dir = slug(d.businessName) + '-website';

  const L = [];
  L.push('Build a complete landing page project in /' + dir + ' (create the folder) using the smart theme "' + theme.name + '" with EXACTLY these colors:');
  L.push(themeJson);
  L.push('');
  L.push('FILES TO CREATE: index.html, style.css, details.js, script.js, README.md.');
  L.push('Also create an /images/ folder with a short README telling the owner: "Upload real business photos here (storefront, interior, team). Update heroImage in details.js to use them." Wire <div id="hero-image" style="background-image: var(--hero-image-url)"> in the hero with the comment /* REPLACE: Upload business image here - Hero and About sections */.');
  L.push('');
  L.push('BUSINESS DATA (use verbatim):');
  L.push('const BUSINESS =');
  L.push(businessJson);
  L.push('');
  L.push('THEME (apply as CSS variables in script.js):');
  L.push('const THEME =');
  L.push(themeJson);
  L.push('');
  L.push('REVIEWS JSON:');
  L.push(reviewsJson);
  L.push('');
  L.push('SOCIAL MEDIA BUTTONS WITH OFFICIAL BRANDING (only for links found in BUSINESS.socialLinks): Facebook #1877F2, Instagram gradient #F58529->#DD2A7B->#515BD4, TikTok #000000, WhatsApp #25D366, Google Maps white with multicolor icon. rounded-full, 44px height, hover:-translate-y-0.5.');
  L.push('');
  L.push('SECTIONS: Header, Hero (name + category + address + rating + Call + WhatsApp buttons), At a glance card, About, What to expect (guide built from review critiques), Services (3 cards from amenities), Reviews cards, Contact (map iframe + Plus Code + Hours + social buttons), Footer "Preview built by TapVinci".');
  if (!d.website) L.push('Since the business has NO website, add an orange badge: "No Website Detected - We built this from Google listing".');
  L.push('style.css must keep the Tailwind CDN config pattern, with .paper radial gradients from THEME brand colors, .hero-grid, .soft-float, .map-frame.');
  L.push('');
  L.push('Run and verify it works locally, then summarize what you built. Return FULL file contents.');
  return L.join('\n');
}

/* PART5 */



