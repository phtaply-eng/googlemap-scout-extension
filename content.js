/* ============================================================
   Taply Scout — content.js
   Google Maps place-panel scraper (client-side only).
   - Waits for the lazy-loaded left panel (h1 = a place is open)
   - Scrapes business fields + up to 15 reviews (scroll + expand)
   - Detects social links (fb/ig/tiktok/etc.) from anchors
     (a[data-item-id*="lud"]), the website field and description
   NOTE: Google renames obfuscated classes occasionally. Every
   field therefore has layered fallbacks; nulls are safe.
   ============================================================ */
(() => {
  if (window.__taplyScoutLoaded) return;
  window.__taplyScoutLoaded = true;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const txt = (el) => (el ? clean(el.textContent) : '');

  const SOCIAL_RE = [
    { key: 'facebook',  label: 'Facebook',   re: /(?:facebook\.com|fb\.com|fb\.me)\/[^\s"'<>]+/i },
    { key: 'instagram', label: 'Instagram',  re: /(?:instagram\.com)\/[^\s"'<>]+/i },
    { key: 'tiktok',    label: 'TikTok',     re: /(?:tiktok\.com)\/[^\s"'<>]+/i },
    { key: 'whatsapp',  label: 'WhatsApp',   re: /(?:wa\.me|whatsapp\.com|api\.whatsapp\.com)\/[^\s"'<>]+/i },
    { key: 'linkedin',  label: 'LinkedIn',   re: /(?:linkedin\.com)\/[^\s"'<>]+/i },
    { key: 'youtube',   label: 'YouTube',    re: /(?:youtube\.com|youtu\.be)\/[^\s"'<>]+/i },
    { key: 'twitter',   label: 'X / Twitter',re: /(?:(?:twitter|x)\.com)\/[^\s"'<>]+/i }
  ];

  /* ---------- panel / readiness ---------- */

  function panelRoot() { return document.querySelector('div[role="main"]'); }

  // The place panel renders lazily; wait until an h1 (place title) exists.
  async function waitForPlace(timeout = 9000) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      const p = panelRoot();
      const h1 = p && p.querySelector('h1');
      if (h1 && clean(h1.textContent).length > 1) return p;
      await sleep(250);
    }
    return panelRoot();
  }

  function isPlaceOpen(p) {
    return !!(p && $('h1', p) && clean($('h1', p).textContent).length > 1);
  }

  /* ---------- field helpers ---------- */

  function deriveCity(address) {
    if (!address) return null;
    const parts = String(address).split(',').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) return null;
    let city = parts[parts.length - 2];
    const last = parts[parts.length - 1];
    // "…, 1210 Metro Manila" (ZIP glued to region) or trailing ZIP → step back one more
    if (/^\d{4,}/.test(last) || /\b\d{4}\b/.test(last)) city = parts[parts.length - 3] || city;
    return city || null;
  }

  function getPlaceFields(p) {
    const d = {};

    // Name
    d.businessName =
      txt($('h1.DUwDvf', p)) ||
      txt($('h1[data-attrid="title"]', p)) ||
      txt($('h1', p)) || '';

    // Category (button chip next to the rating opens the categories pane)
    d.category =
      txt($('button.DkEaL0', p)) ||
      txt($('button[jsaction*="wfvdle17"]', p)) || '';

    // Header meta row: "4.8 (126) · Dental clinic · $ · Open now"
    const metaBits = (() => {
      const nice = $('div.F7nice', p);
      const c = nice && nice.parentElement;
      if (!c) return [];
      return clean(c.textContent).split('·').map((s) => s.trim()).filter(Boolean);
    })();
    const nonMeta = metaBits.filter((b) =>
      !/^[\d.,]+$/.test(b) && !/^\(/.test(b) && !/^[$₱]{1,4}$/.test(b) &&
      !/^(open now|open ⋅|closed|opens soon|closes soon)/i.test(b)
    );
    if (!d.category && nonMeta.length) d.category = nonMeta[0];
    d.subCategory = (nonMeta.find((b) => b !== d.category) || '');

    // Rating / review count
    let rating = null, reviewCount = null;
    const starImg = $('span.ceNzKf[role="img"]', p) || $('[role="img"][aria-label*="star" i]', p);
    const sm = starImg && (starImg.getAttribute('aria-label') || '').match(/([\d.]+)/);
    if (sm) rating = parseFloat(sm[1]);
    const nice = $('div.F7nice', p);
    if (nice) {
      const n = clean(nice.textContent);
      const rm = n.match(/^([\d.,]+)/);
      if (rm && rating == null) rating = parseFloat(rm[1].replace(',', '.'));
      const cm = n.match(/\(([\d,]+)\)/) || n.match(/([\d,]+)\s*review/i);
      if (cm) reviewCount = parseInt(cm[1].replace(/,/g, ''), 10);
    }
    d.rating = rating;
    d.reviewCount = reviewCount;

    // Address / phone / website / plus code (data-item-id anchors)
    const addr = $('button[data-item-id="address"]', p) || $('a[data-item-id="address"]', p);
    d.address = addr ? txt(addr) : null;
    const ph = $('[data-item-id^="phone:tel:"]', p) || $('button[data-item-id="phone"]', p);
    d.phone = ph ? txt(ph) : null;
    const site = $('a[data-item-id="authority"]', p);
    d.website = site ? site.href : null;
    const pc = $('button[data-item-id^="oloc"]', p) ||
      $$('button', p).find((b) => /plus\s*code/i.test(b.getAttribute('aria-label') || ''));
    d.plusCode = pc ? txt(pc) : null;

    // Price level ($–$$$$, maps uses $ even in PH)
    d.priceLevel = $$('span', p).map((s) => clean(s.textContent)).find((t) => /^[$₱]{1,4}$/.test(t)) || null;

    // Open state
    const statusEl = $$('span', p).find((s) =>
      /^(open now|open ⋅|opens soon|closes soon|closed ⋅|closed)/i.test(clean(s.textContent)));
    d.openStatusText = statusEl ? clean(statusEl.textContent) : null;
    d.isOpenNow = d.openStatusText ? /^open/i.test(d.openStatusText) : null;

    // Photos count ("See photos (57)" style labels)
    const photoBtn = $('button[jsaction*="pane.photos"]', p) ||
      $$('button[aria-label]', p).find((b) => /photos?/i.test(b.getAttribute('aria-label') || ''));
    const plabel = photoBtn ? ((photoBtn.getAttribute('aria-label') || '') + ' ' + txt(photoBtn)) : '';
    const pm = plabel.match(/\(([\d,]+)\)/) || plabel.match(/([\d,]+)\s*photos?/i);
    d.photosCount = pm ? parseInt(pm[1].replace(/,/g, ''), 10) : null;

    // City / URLs / place id
    d.city = deriveCity(d.address);
    const canon = $('link[rel="canonical"]', document.head);
    d.googleMapsUrl = (canon && canon.href) || location.href;
    const u = location.href;
    const m1 = u.match(/1s(0x[0-9a-fA-F]+:0x[0-9a-fA-F]+)/);
    const cid = u.match(/(ChIJ[0-9A-Za-z_-]{10,32})/);
    d.placeId = (m1 && m1[1]) || (cid && cid[1]) || null;

    return d;
  }

  /* ---------- description / services ---------- */

  function findSectionHeading(p, re) {
    const heads = $$('h2, h3, [role="heading"], .fontHeadlineSmall', p);
    for (const h of heads) if (re.test(clean(h.textContent))) return h;
    return null;
  }

  function afterHeadingText(h, limit = 700) {
    let out = '';
    let node = h.nextElementSibling;
    for (let i = 0; node && i < 4; i++) {
      out += ' ' + clean(node.textContent);
      node = node.nextElementSibling;
      if (out.length > limit) break;
    }
    if (out.length < 40 && h.parentElement) {
      node = h.parentElement.nextElementSibling;
      for (let i = 0; node && i < 3; i++) {
        out += ' ' + clean(node.textContent);
        node = node.nextElementSibling;
        if (out.length > limit) break;
      }
    }
    return out.length ? clean(out).slice(0, limit) : '';
  }

  function getDescription(p) {
    const h = findSectionHeading(p, /description|from (the|this) (business|owner)|about/i);
    if (h) {
      const t = afterHeadingText(h);
      if (t && !/^(show|see|more|all)/i.test(t)) return t;
    }
    // Fallback: an unstructured paragraph-looking block
    const para = $$('div, p', p).find((e) => {
      const t = clean(e.textContent);
      return t.length > 80 && t.length < 720 && /\.$/.test(t) &&
        !/[★★]/.test(t) && !e.querySelector('h1, h2, button[data-item-id]');
    });
    return para ? clean(para.textContent) : null;
  }

  function getServices(p) {
    const h = findSectionHeading(p, /amenit|service option|services|highlights|offerings/i);
    if (!h) return [];
    const box = (h.closest('div[jsaction], div[data-section-id]') || h.parentElement || h).parentElement || h.parentElement;
    const chips = new Set();
    $$('[role="checkbox"][aria-label]', box).forEach((c) => {
      const t = clean(c.getAttribute('aria-label'));
      if (t && t.length <= 48) chips.add(t.replace(/✓|✗|confirmed|unconfirmed/ig, '').trim());
    });
    $$('button, span, div[aria-label]', box).forEach((b) => {
      const t = clean(b.textContent);
      if (t && t.length >= 2 && t.length <= 44 && !/^(show|see|more|less|hide|all)\b/i.test(t) &&
          !/[$₱]/.test(t) && !/[·•]/.test(t) && b.children.length === 0) chips.add(t);
    });
    return Array.from(chips)
      .filter((t) => t && !/\bno |closed now/i.test(t))
      .slice(0, 14);
  }

  /* ---------- socials ---------- */

  function normalizeUrl(url) {
    try { return new URL(url, location.origin).href; } catch (e) { return url; }
  }

  function getSocialLinks(p, website, description) {
    const found = new Map();
    const bump = (raw) => {
      if (!raw) return;
      const url = normalizeUrl(raw);
      for (const s of SOCIAL_RE) {
        if (s.re.test(url)) {
          if (!found.has(s.key)) found.set(s.key, { platform: s.label, url });
          return;
        }
      }
    };
    // 1) anchors whose data-item-id contains "lud" (external/link-item ids)
    $$('a[data-item-id]', p).forEach((a) => {
      const id = a.getAttribute('data-item-id') || '';
      if (/lud/i.test(id)) bump(a.href);
    });
    // 2) any anchor in the panel pointing at a social domain
    $$('a', p).forEach((a) => bump(a.href));
    // 3) the website field itself (fb page used as "website")
    bump(website);
    // 4) description text
    if (description) for (const s of SOCIAL_RE) {
      const m = String(description).match(s.re);
      if (m) bump(m[0]);
    }
    return Array.from(found.values());
  }

  /* ---------- hours ---------- */

  function hourRowsFromTables(p) {
    const gen = $$('table tr', p).filter((r) => {
      const cs = Array.from(r.children);
      return cs.length >= 2 && cs.length <= 4 && clean(cs[0].textContent).length <= 15 &&
        clean(cs[0].textContent).length > 2;
    });
    return gen.map((r) => {
      const cs = Array.from(r.children);
      const day = clean(cs[0].textContent);
      const rest = clean(cs.slice(1).map((c) => txt(c)).join(', ')) || 'Closed';
      return `${day}: ${rest}`;
    });
  }

  function gatherHours(p) {
    const rows = $$('table.eK4RlL tr', p);
    if (rows.length) {
      return rows.map((r) => {
        const tds = Array.from(r.querySelectorAll('td'));
        const day = clean(tds[0] && tds[0].textContent);
        const hrs = clean(tds.slice(1).map((t) => txt(t)).join(', ')) || 'Closed';
        return day ? `${day}: ${hrs}` : '';
      }).filter(Boolean);
    }
    return null;
  }

  async function getOpeningHours(p, statusText) {
    let hours = gatherHours(p);
    if (hours && hours.length) return hours;
    // Try expanding the hours dropdown (reversible local UI action)
    const btn = $$('button, [role="button"]', p).find((b) => {
      const a = (b.getAttribute('aria-label') || '') + ' ' + clean(b.textContent);
      return a.length < 90 && /(open|closed|closes|opens|hours)/i.test(a) &&
        !/photo|review|call|direction|dine|\bbed\b/i.test(a);
    });
    if (btn) {
      try {
        btn.click();
        await sleep(400);
        hours = gatherHours(p) || hourRowsFromTables(p);
        btn.click(); // toggle back
        await sleep(250);
      } catch (e) { /* noop */ }
    }
    if (hours && hours.length) return hours.slice(0, 7);
    return statusText ? [statusText] : [];
  }

  /* ---------- reviews ---------- */

  const REVIEW_ITEM_SELS = ['div[data-review-id]', 'div.jftiEf', 'div[data-position][jscontroller]'];

  function reviewItems() {
    for (const s of REVIEW_ITEM_SELS) {
      const items = $$(s);
      if (items.length) return items;
    }
    return [];
  }

  function parseStars(el) {
    const cand = el.querySelector('[role="img"][aria-label*="star" i]') ||
      el.querySelector('[aria-label*="star" i]');
    if (cand) {
      const m = (cand.getAttribute('aria-label') || '').match(/([\d.]+)/);
      if (m) { const v = Math.round(parseFloat(m[1])); if (v >= 1 && v <= 5) return v; }
    }
    const imgs = $$('img.hCCjke', el);
    if (imgs.length >= 5) {
      const filled = imgs.filter((im) => /elGi1d|NhBTye/.test(im.className)).length;
      if (filled >= 1 && filled <= 5) return filled;
    }
    return null;
  }

  function parseReview(el) {
    const authorEl = el.querySelector('a[href*="contrib"]') || el.querySelector('.d4r35780c');
    let dateEl = el.querySelector('span.rsqaWe');
    if (!dateEl) {
      dateEl = $$('span', el).find((s) => {
        const t = clean(s.textContent);
        return /\b(ago|hour|day|week|month|year)\b/i.test(t) && t.length < 40 && s.children.length === 0;
      }) || null;
    }
    let textEl = el.querySelector('span.wiI7pd') || el.querySelector('div.MyEned span') || null;
    if (!textEl) {
      const spans = $$('span, p', el);
      textEl = spans.reduce((best, s) => {
        const t = txt(s);
        return (!best || t.length > txt(best).length) ? s : best;
      }, null);
    }
    return {
      author: txt(authorEl) || null,
      rating: parseStars(el),
      date: dateEl ? clean(dateEl.textContent) : null,
      text: textEl ? clean(textEl.textContent) : null
    };
  }

  async function expandTruncated(items) {
    for (const it of items.slice(0, 18)) {
      for (const b of $$('button', it)) {
        if (/^more$/i.test(clean(b.textContent))) {
          try { b.click(); await sleep(150); break; } catch (e) { /* noop */ }
        }
      }
    }
  }

  function scrollableFrom(el) {
    let e = el;
    while (e && e !== document.body) {
      const cs = getComputedStyle(e);
      if ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') &&
          e.scrollHeight - e.clientHeight > 60) return e;
      e = e.parentElement;
    }
    return null;
  }

  async function switchToReviewsIfTabbed() {
    try {
      const tab = $$('[role="tab"], button[role="tab"], a[role="tab"]').find((t) =>
        /reviews?/i.test(clean(t.textContent)) || /review/i.test(t.getAttribute('aria-label') || ''));
      if (tab && tab.getAttribute('aria-selected') !== 'true') {
        tab.click();
        await sleep(1400);
        return true;
      }
    } catch (e) { /* noop */ }
    return false;
  }

  async function collectReviews(target = 15, maxMs = 14000) {
    const switched = await switchToReviewsIfTabbed();
    const t0 = Date.now();
    let lastCount = 0, stagnant = 0;

    while (Date.now() - t0 < maxMs) {
      const items = reviewItems();
      if (items.length >= 1) {
        const sc = scrollableFrom(items[items.length - 1]) || scrollableFrom(panelRoot());
        if (sc) sc.scrollBy(0, Math.max(900, Math.floor(sc.clientHeight * 0.85)));
      }
      await sleep(420);
      const count = reviewItems().length;
      if (count >= target) break;
      if (count === lastCount) { if (++stagnant >= 7) break; }
      else { stagnant = 0; lastCount = count; }
    }

    let items = reviewItems().slice(0, Math.max(target, 18));
    await expandTruncated(items);

    const out = [];
    const seen = new Set();
    for (const it of items) {
      const r = parseReview(it);
      const key = `${r.author || ''}|${r.date || ''}|${(r.text || '').slice(0, 40)}`;
      if (!seen.has(key)) { seen.add(key); out.push(r); }
      if (out.length >= target) break;
    }

    // Courtesy: go back to Overview after scraping the Reviews tab
    if (switched) {
      try {
        const ov = $$('[role="tab"], button[role="tab"], a[role="tab"]').find((t) =>
          /overview|photos|about/i.test(clean(t.textContent)));
        if (ov) { ov.click(); await sleep(600); }
      } catch (e) { /* noop */ }
    }
    return out;
  }

  /* ---------- orchestrator ---------- */

  async function scrapeAll() {
    const p = await waitForPlace();
    if (!isPlaceOpen(p)) return { error: 'NO_BUSINESS' };

    const d = getPlaceFields(p);
    d.description = getDescription(p);
    d.services = getServices(p);
    d.openingHours = await getOpeningHours(p, d.openStatusText);
    d.socialLinks = getSocialLinks(p, d.website, d.description);

    d.websiteIsSocial = d.website ? SOCIAL_RE.some((s) => s.re.test(d.website)) : false;
    d.leadScore = !d.website ? 'High'
      : (d.websiteIsSocial ? 'Medium' : 'Low');

    d.reviews = await collectReviews(15);
    d.reviewCount = d.reviewCount != null ? d.reviewCount : (d.reviews.length || null);
    d.scrapedAt = new Date().toISOString();
    return { ok: true, data: d };
  }

  /* ---------- message bus ---------- */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.type === 'TAPLY_SCOUT_SCRAPE') {
      scrapeAll()
        .then((r) => sendResponse(r))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true; // keep channel open for the async reply
    }
  });

  console.log('[Taply Scout] content script ready — open a business panel and press Get Info.');
})();
