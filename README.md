# Taply Scout v2 — Google Maps Lead Scraper + Smart Theme Prompt Builder

Brave / Chrome / Chromium extension (Manifest V3, no backend, no build step).

Open a business on Google Maps → click the icon → **Get Info** → get the business data, a "no website = good lead" flag, an auto-picked color theme, MD/TXT exports and two copy-paste prompts that build a landing page in the business's colors.

## Load it in Brave

1. **Unzip** `taply-scout.zip`.
2. Open `brave://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and choose the folder that directly contains `manifest.json`.
4. Pin the extension (puzzle icon).
5. After any code change: click the reload arrow on the extension card, then refresh the Maps tab.

## Use it

1. On Google Maps, click a business so the left profile panel is open.
2. Click the Taply Scout icon → **Get Info** (a floating "Get Info" button also shows on the map; after using it, open the icon to export).
3. The popup shows: name, category, rating, lead badge, **Detected category → theme** with 3 color dots, key facts, and a live preview.
4. Four buttons:
   - **Export as MD** / **Export as TXT** → downloads `{slug}-tapvinci-scout.md` / `.txt`
   - **Copy VS Code Prompt** → ChatGPT / Claude / Cursor prompt (index.html, style.css, details.js, script.js)
   - **Copy OpenCode Prompt** → full-project prompt (adds README.md and an `/images/` folder)
5. The MD / TXT / VS Code / OpenCode tabs above the buttons preview exactly what each button outputs.

The toolbar icon shows **LEAD** (orange) after scanning a business with no website, **OK** if it has one.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | MV3 manifest (activeTab, scripting, storage, clipboardWrite; Maps hosts only) |
| `src/scraper.js` | Reads the Maps panel, About tab and reviews. **`SEL` block = selectors to fix if Google changes its markup.** |
| `src/content.js` | Message handler + floating "Get Info" button |
| `src/background.js` | Toolbar badge (LEAD / OK) |
| `popup/popup.html`, `popup.css`, `popup.js` | The popup UI and `getBusinessTheme()` |
| `popup/shared.js` | MD / TXT / prompt builders and `CONFIG` (brand names, footer credit, placeholders) |
| `icons/` | Toolbar icons |

## Edit in Visual Studio Code

`File > Open Folder…` and pick this folder.

- **Theme colors / category keywords:** `THEMES` and `RULES` at the top of `popup/popup.js`
- **Prompt wording:** `buildVSCodePrompt()` / `buildOpenCodePrompt()` in `popup/shared.js`
- **Brand, footer credit, file suffix, placeholders:** `CONFIG` in `popup/shared.js`
- **Popup look:** CSS variables at the top of `popup/popup.css`
- **Number of reviews:** `maxReviews: 15` in `scrape()` in `src/scraper.js`

## Theme engine

| Category contains | Theme |
|---|---|
| dental, dentist, orthodontist | Dental Blue & White (#0B63CE) |
| barber, hair, tattoo | Black & White Premium (#111111 + gold #C5A46A) |
| restaurant, cafe, coffee, bistro, bakery, … | Warm Earth (#B45309) |
| gym, fitness, crossfit, boxing, … | Energy Black & Red (#DC2626) |
| spa, massage, wellness, beauty, salon, nail | Soft Sage & Blush (#6B8E6B) |
| clinic, medical, doctor, vet, … | Clean Medical Blue (#0891B2) |
| law, lawyer, accounting, real estate, … | Navy Trust (#1E3A8A) |
| anything else | Neutral Slate (#111827) |

Words match on word boundaries, so "co-working space" does not trigger "spa". Dental is checked before clinic, so "dental clinic" gets the dental theme.

## Good to know

- **Placeholders are intentional.** Prompts contain `[ATTACH YOUR REFERENCE FILES HERE …]`. Hero and about images are empty `heroImage` / `aboutImage` fields in `details.js`. Nothing about the business or you is invented.
- **WhatsApp link** is derived from PH mobile numbers (09XX → wa.me/639XX) and is unverified. The prompt tells the AI to hide the button if it is null.
- **Socials** come from links in the panel (`data-item-id*="lud"` and other outbound links), the website field and the description. Many small businesses show none.
- **Sub-category** is only filled if Maps shows a second category. **Photos count** only if Maps shows a number in the panel.
- **Place ID:** Maps URLs usually give the feature ID (`0x…:0x…`) and a `cid`, not the `ChIJ…` Place ID.
- **Popup height:** Chromium caps extension popups at 600px, so the content scrolls and the 4 buttons stay docked at the bottom.
- SF Pro shows on Mac/iOS; on Windows the font falls back to Segoe UI / Inter.
- Keep outreach light and respectful, and check Google's terms and the Philippines Data Privacy Act before scraping at volume.
