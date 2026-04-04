# CLAUDE.md

## Project Documentation

See `docs/overview.md` for a full description of the app, its features, file structure, data format, and tech stack.

## Inflation Config

The file `js/inflationConfig.js` contains annual CPI inflation rates for Croatia. These power the yellow "Income (real)" line on charts.

- **Update yearly**: When a new calendar year's inflation data is available, add the entry to the `INFLATION_RATES` object (year → percentage).
- **Source**: Use official Croatian CPI data (e.g. worlddata.info, Trading Economics, or Eurostat/ECB).
- **Partial years**: For the current year, use the latest available monthly YoY figure as an estimate. Update it once the full-year figure is published.
- The `getCPIIndex()` helper computes cumulative indices from these rates — no manual calculation needed.

## Rules

- Do NOT add "Co-Authored-By" lines to commit messages.
- After making changes to the codebase, update `docs/overview.md` to reflect any new features, changed file structure, modified data handling, or altered behavior. Keep the docs accurate and current.
