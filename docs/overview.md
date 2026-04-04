# Cashew Analyzer

A personal spending analysis dashboard that visualizes financial data exported from the [Cashew](https://budgetwithcashew.com/) budgeting app.

## What It Does

Loads a Cashew CSV export and provides interactive visualizations to understand spending patterns, with a focus on distinguishing essential expenses from discretionary ones.

### Views

- **Year view** — Stacked bar chart of spending by category per year. A green income line overlays the bars showing income vs expenses. Click a year to drill into months.
- **Month view** — Stacked bar chart of monthly spending for a selected year, or a scrollable time series across all years (with zoom). Income line included. Click a month bar to drill into a **nested pie chart**: inner pie shows categories (original colors, sorted by group then amount), outer ring shows group totals (Must Have / Can Save / Rest). Click anywhere or "Back" to return.
- **Groups view** — A 2-level treemap showing three spending groups as proportional rectangles:
  - **Must Have** (red) — essential expenses (housing, transport, health, groceries, bills)
  - **Can Save** (amber) — discretionary but reducible (dining out, coffee, beer, entertainment)
  - **Rest** (blue-gray) — everything else (travel, gifts, one-time expenses)
  - A summary bar below shows group percentages at a glance
  - A time trend toggle shows how group proportions change over years

### Key Features

- **Group editor** — Tap a category pill to move it between Must Have / Can Save / Rest. Drag-and-drop also works on desktop. Group assignments persist in localStorage.
- **Category filters** — Toggle individual categories on/off. An Expenses/Income switch separates expense and income categories into their own views. Categories with subcategories expand to show subcategory-level checkboxes. Amounts update to reflect the current view period (all years in year view, single year in month/group views).
- **Subcategory filtering** — Expand a parent category to toggle individual subcategories. Parent checkbox shows indeterminate state when some subcategories are excluded. All categories with subcategories show the expand arrow in both expense and income views.
- **Excluded categories toggle** — Categories can be marked as excluded (stored in localStorage). A "Show Excluded" toggle reveals them in the expense filter.
- **Income line** — Solid green line on bar charts showing income per period. Labels display the income value (year and month bar views). Respects category/subcategory filters.
- **Inflation-adjusted income line** — Solid yellow line showing income deflated to base-year (earliest year) purchasing power using Croatian CPI data. Inflation rates are configured in `js/inflationConfig.js`. In year view, each year uses its cumulative CPI index. In month views, all months in a year share that year's CPI index. Labels show the real value. Tooltips include both nominal and real income.
- **Net line** — Dashed line showing income minus expenses per period. Green when net is positive, red (line and label) when negative. Labels have a dark background for readability. Tooltips show expenses, income, and net.
- **CSV upload** — Upload a new Cashew CSV export. Stored in IndexedDB so it persists across sessions. The app always uses the most recent file.

## Tech Stack

- **No build step** — static HTML served from any web server
- **ECharts 5** (CDN) — charts and treemaps
- **PapaParse 5** (CDN) — CSV parsing
- **Vanilla JS** (ES modules) — no framework
- **localStorage** — persists group assignments, view preferences, subcategory exclusions
- **IndexedDB** — persists uploaded CSV files

## File Structure

```
cashewAnalyzer/
├── index.html              — App shell, CDN script tags
├── .gitignore              — Ignores data/ folder
├── css/
│   └── style.css           — Dark theme, mobile-first responsive layout
├── data/                   — CSV storage (gitignored)
│   └── *.csv               — Cashew exports
├── docs/
│   └── overview.md         — This file
└── js/
    ├── app.js              — Entry point, init flow, upload handling
    ├── dataLoader.js       — CSV parsing, normalization, aggregation functions, IndexedDB
    ├── state.js            — Pub-sub state store, localStorage persistence, filter logic
    ├── charts.js           — All ECharts rendering (year, month, group treemap, trend)
    ├── inflationConfig.js  — Croatian CPI inflation rates by year + cumulative index helper
    ├── groupManager.js     — Group editor UI (tap-to-move, drag-and-drop)
    └── controls.js         — Year selector, view tabs, category/subcategory filters
```

## Data Format

Expects Cashew CSV exports with these columns:

```
account, amount, currency, title, note, date, income, type,
category name, subcategory name, color, icon, emoji, budget, objective
```

- Amounts: positive = income, negative = expenses
- Dates: `YYYY-MM-DD HH:MM:SS.mmm`
- Colors: `0xff66bb6a` format (converted to `#66bb6a` at parse time)
- Categories may have subcategories
- Categories are split into expense and income views based on the `income` flag on each transaction

## Running Locally

```bash
cd cashewAnalyzer
python3 -m http.server 8765
# Open http://localhost:8765
```

Or any static file server. The app needs HTTP (not `file://`) because it uses `fetch()` to load CSV files from the `data/` directory.

## State Persistence

All user preferences survive page reloads:

| What | Storage | Key |
|------|---------|-----|
| Group assignments | localStorage | `cashew_group_assignments` |
| View mode, selected year, show excluded, filter mode | localStorage | `cashew_view_prefs` |
| Subcategory exclusions | localStorage | `cashew_subcategory_exclusions` |
| Excluded categories | localStorage | `cashew_excluded_categories` |
| Uploaded CSV files | IndexedDB | `cashew_analyzer` / `csv_files` |

## Default Filter State

All categories are enabled by default on page load. Excluded categories (configured via localStorage) are hidden from the expense filter unless the "Show Excluded" toggle is on. Filter state is not persisted across reloads.
