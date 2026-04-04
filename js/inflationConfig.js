// Annual CPI inflation rates for Croatia (%)
// Source: worlddata.info, Trading Economics
export const INFLATION_RATES = {
  2017: 1.30,
  2018: 1.60,
  2019: 0.80,
  2020: 0.00,
  2021: 2.70,
  2022: 10.70,
  2023: 8.40,
  2024: 4.00,
  2025: 4.40,
  2026: 3.80,
};

/**
 * Build a cumulative CPI index for the given sorted years.
 * Base year (first year) = 1.0; each subsequent year compounds.
 * Returns { year: cpiIndex, ... }
 */
export function getCPIIndex(years) {
  const sorted = [...years].map(Number).sort((a, b) => a - b);
  const index = {};
  let cumulative = 1.0;
  for (const y of sorted) {
    const rate = INFLATION_RATES[y] ?? 0;
    if (y === sorted[0]) {
      index[y] = 1.0;
    } else {
      cumulative *= 1 + rate / 100;
      index[y] = cumulative;
    }
  }
  return index;
}
