const DB_NAME = 'cashew_analyzer';
const DB_VERSION = 1;
const STORE_NAME = 'csv_files';

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCSVToIndexedDB(filename, content) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({
      id: filename,
      content,
      timestamp: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getLatestCSVFromIndexedDB() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const files = req.result;
      if (!files.length) return resolve(null);
      files.sort((a, b) => b.timestamp - a.timestamp);
      resolve(files[0]);
    };
    req.onerror = () => reject(req.error);
  });
}

function convertColor(raw) {
  if (!raw || raw === 'null') return '#78909c';
  // Format: 0xff66bb6a -> #66bb6a
  return '#' + raw.slice(4);
}

function parseDate(str) {
  if (!str) return null;
  // Format: 2026-04-03 19:26:23.000
  return new Date(str.replace(' ', 'T'));
}

function normalizeRow(row) {
  const date = parseDate(row.date);
  const category = (!row['category name'] || row['category name'] === 'null')
    ? (row['subcategory name'] && row['subcategory name'] !== 'null' ? row['subcategory name'] : 'Uncategorized')
    : row['category name'];

  return {
    amount: parseFloat(row.amount) || 0,
    title: row.title || '',
    note: row.note || '',
    date,
    year: date ? date.getFullYear() : null,
    month: date ? date.getMonth() + 1 : null,
    isIncome: row.income === 'true' || row.income === true,
    type: row.type !== 'null' ? row.type : null,
    category,
    subcategory: (row['subcategory name'] && row['subcategory name'] !== 'null') ? row['subcategory name'] : '',
    color: convertColor(row.color),
    icon: row.icon || '',
  };
}

export function parseCSV(content) {
  return new Promise((resolve, reject) => {
    Papa.parse(content, {
      header: true,
      skipEmptyLines: true,
      complete(results) {
        const transactions = results.data
          .map(normalizeRow)
          .filter(t => t.date && t.year);
        resolve(transactions);
      },
      error(err) {
        reject(err);
      }
    });
  });
}

export async function loadFromDataFolder() {
  // Try to fetch the known CSV file pattern from data/ folder
  // Since we can't list directory contents, we try the known filename
  const response = await fetch('data/');
  if (response.ok) {
    const html = await response.text();
    // Parse directory listing for .csv files
    const csvMatches = html.match(/href="([^"]*\.csv)"/g);
    if (csvMatches) {
      const filenames = csvMatches.map(m => m.match(/href="([^"]*\.csv)"/)[1]);
      // Sort by name (which includes date) descending to get most recent
      filenames.sort().reverse();
      const latest = filenames[0];
      const csvResponse = await fetch(`data/${latest}`);
      if (csvResponse.ok) {
        return { filename: latest, content: await csvResponse.text() };
      }
    }
  }
  return null;
}

function buildCategoryList(transactions) {
  const catMap = new Map();
  const subMap = new Map();

  for (const t of transactions) {
    const existing = catMap.get(t.category);
    if (existing) {
      existing.total += Math.abs(t.amount);
      existing.count++;
    } else {
      catMap.set(t.category, {
        name: t.category,
        color: t.color,
        total: Math.abs(t.amount),
        count: 1,
        isIncome: t.isIncome,
        subcategories: [],
      });
    }

    if (t.subcategory) {
      const key = `${t.category}::${t.subcategory}`;
      const sub = subMap.get(key);
      if (sub) {
        sub.total += Math.abs(t.amount);
      } else {
        subMap.set(key, { name: t.subcategory, category: t.category, total: Math.abs(t.amount) });
      }
    }
  }

  for (const [, sub] of subMap) {
    const parent = catMap.get(sub.category);
    if (parent) {
      parent.subcategories.push({ name: sub.name, total: sub.total });
    }
  }

  for (const [, cat] of catMap) {
    cat.subcategories.sort((a, b) => b.total - a.total);
  }

  return Array.from(catMap.values()).sort((a, b) => b.total - a.total);
}

export function extractCategories(transactions) {
  const all = buildCategoryList(transactions);
  const expense = buildCategoryList(transactions.filter(t => !t.isIncome));
  const income = buildCategoryList(transactions.filter(t => t.isIncome));
  return { all, expense, income };
}

export function aggregateByYear(transactions) {
  const result = {};
  for (const t of transactions) {
    if (!result[t.year]) result[t.year] = {};
    if (!result[t.year][t.category]) result[t.year][t.category] = 0;
    result[t.year][t.category] += Math.abs(t.amount);
  }
  return result;
}

export function aggregateByMonth(transactions) {
  const result = {};
  for (const t of transactions) {
    const key = t.month;
    if (!result[key]) result[key] = {};
    if (!result[key][t.category]) result[key][t.category] = 0;
    result[key][t.category] += Math.abs(t.amount);
  }
  return result;
}

export function aggregateByMonthAllYears(transactions) {
  const result = {};
  for (const t of transactions) {
    const key = `${t.year}-${String(t.month).padStart(2, '0')}`;
    if (!result[key]) result[key] = {};
    if (!result[key][t.category]) result[key][t.category] = 0;
    result[key][t.category] += Math.abs(t.amount);
  }
  return result;
}

export function aggregateIncomeByYear(transactions) {
  const result = {};
  for (const t of transactions) {
    if (!t.isIncome) continue;
    if (!result[t.year]) result[t.year] = 0;
    result[t.year] += t.amount;
  }
  return result;
}

export function aggregateIncomeByMonth(transactions) {
  const result = {};
  for (const t of transactions) {
    if (!t.isIncome) continue;
    if (!result[t.month]) result[t.month] = 0;
    result[t.month] += t.amount;
  }
  return result;
}

export function aggregateIncomeByMonthAllYears(transactions) {
  const result = {};
  for (const t of transactions) {
    if (!t.isIncome) continue;
    const key = `${t.year}-${String(t.month).padStart(2, '0')}`;
    if (!result[key]) result[key] = 0;
    result[key] += t.amount;
  }
  return result;
}

export function aggregateByGroup(transactions, groupAssignments) {
  const groupLookup = {};
  for (const [group, cats] of Object.entries(groupAssignments)) {
    for (const cat of cats) {
      groupLookup[cat] = group;
    }
  }

  const result = {
    mustHave: { total: 0, categories: {} },
    canSave: { total: 0, categories: {} },
    rest: { total: 0, categories: {} },
  };

  for (const t of transactions) {
    const group = groupLookup[t.category] || 'rest';
    const amount = Math.abs(t.amount);
    result[group].total += amount;
    if (!result[group].categories[t.category]) {
      result[group].categories[t.category] = 0;
    }
    result[group].categories[t.category] += amount;
  }

  return result;
}

export function aggregateGroupsByTime(transactions, groupAssignments, byYear = false) {
  const groupLookup = {};
  for (const [group, cats] of Object.entries(groupAssignments)) {
    for (const cat of cats) {
      groupLookup[cat] = group;
    }
  }

  const result = {};
  for (const t of transactions) {
    const key = byYear ? String(t.year) : `${t.year}-${String(t.month).padStart(2, '0')}`;
    if (!result[key]) result[key] = { mustHave: 0, canSave: 0, rest: 0 };
    const group = groupLookup[t.category] || 'rest';
    result[key][group] += Math.abs(t.amount);
  }

  return result;
}

export function formatEUR(amount) {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
