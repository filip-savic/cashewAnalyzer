const STORAGE_KEY_GROUPS = 'cashew_group_assignments';
const STORAGE_KEY_FILTERS = 'cashew_category_filters';
const STORAGE_KEY_VIEW = 'cashew_view_prefs';
const STORAGE_KEY_SUBCAT = 'cashew_subcategory_exclusions';
const STORAGE_KEY_LINES = 'cashew_line_visibility';

const listeners = {};
const wildcardListeners = [];

const state = {
  transactions: [],
  categories: [],              // all categories (for color lookup)
  expenseCategories: [],       // from non-income transactions
  incomeCategories: [],        // from income transactions
  viewMode: 'year',
  groupSubView: 'treemap',
  selectedYear: null,
  selectedMonth: null,
  categoryFilters: null,       // null = all, Set = explicit filter (expenses)
  incomeCategoryFilters: null,  // null = all, Set = explicit filter (income)
  groupAssignments: null,
  filterMode: 'expenses',     // 'expenses' | 'income'
  subcategoryExclusions: new Set(),
  loadedFile: '',
  lineVisibility: { income: true, incomeReal: true, net: true },
};

function loadPersistedState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_GROUPS);
    if (saved) {
      state.groupAssignments = JSON.parse(saved);
    }
  } catch { /* use defaults */ }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_VIEW);
    if (saved) {
      const prefs = JSON.parse(saved);
      if (prefs.viewMode) state.viewMode = prefs.viewMode;
      if (prefs.selectedYear !== undefined) state.selectedYear = prefs.selectedYear;
      if (prefs.filterMode) state.filterMode = prefs.filterMode;
    }
  } catch { /* use defaults */ }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_SUBCAT);
    if (saved) {
      state.subcategoryExclusions = new Set(JSON.parse(saved));
    }
  } catch { /* use defaults */ }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_LINES);
    if (saved) {
      state.lineVisibility = { ...state.lineVisibility, ...JSON.parse(saved) };
    }
  } catch { /* use defaults */ }

  try {
    const saved = localStorage.getItem(STORAGE_KEY_FILTERS);
    if (saved) {
      const f = JSON.parse(saved);
      if (f.categoryFilters !== null) state.categoryFilters = new Set(f.categoryFilters);
      if (f.incomeCategoryFilters !== null) state.incomeCategoryFilters = new Set(f.incomeCategoryFilters);
    }
  } catch { /* use defaults */ }
}

function persistGroups() {
  try {
    localStorage.setItem(STORAGE_KEY_GROUPS, JSON.stringify(state.groupAssignments));
  } catch { /* storage full */ }
}

function persistViewPrefs() {
  try {
    localStorage.setItem(STORAGE_KEY_VIEW, JSON.stringify({
      viewMode: state.viewMode,
      selectedYear: state.selectedYear,
      filterMode: state.filterMode,
    }));
  } catch { /* storage full */ }
}

function persistSubcatExclusions() {
  try {
    localStorage.setItem(STORAGE_KEY_SUBCAT, JSON.stringify([...state.subcategoryExclusions]));
  } catch { /* storage full */ }
}

function persistFilters() {
  try {
    localStorage.setItem(STORAGE_KEY_FILTERS, JSON.stringify({
      categoryFilters: state.categoryFilters ? [...state.categoryFilters] : null,
      incomeCategoryFilters: state.incomeCategoryFilters ? [...state.incomeCategoryFilters] : null,
    }));
  } catch { /* storage full */ }
}

function persistLineVisibility() {
  try {
    localStorage.setItem(STORAGE_KEY_LINES, JSON.stringify(state.lineVisibility));
  } catch { /* storage full */ }
}

function notify(key, value) {
  (listeners[key] || []).forEach(cb => cb(value, key));
  wildcardListeners.forEach(cb => cb(key, value));
}

export const State = {
  get(key) {
    return state[key];
  },

  set(key, value) {
    if (state[key] === value) return;
    state[key] = value;

    if (key === 'groupAssignments') persistGroups();
    if (['viewMode', 'selectedYear', 'filterMode'].includes(key)) persistViewPrefs();
    if (['categoryFilters', 'incomeCategoryFilters'].includes(key)) persistFilters();
    if (key === 'subcategoryExclusions') persistSubcatExclusions();
    if (key === 'lineVisibility') persistLineVisibility();

    notify(key, value);
  },

  on(key, cb) {
    if (key === '*') {
      wildcardListeners.push(cb);
    } else {
      if (!listeners[key]) listeners[key] = [];
      listeners[key].push(cb);
    }
  },

  getFilteredTransactions() {
    let txns = state.transactions;
    const filters = state.categoryFilters;

    // Filter out income
    txns = txns.filter(t => !t.isIncome);

    // Apply category filters (null = all, Set = explicit)
    if (filters !== null) {
      txns = txns.filter(t => filters.has(t.category));
    }

    // Apply subcategory exclusions
    const subExcl = state.subcategoryExclusions;
    if (subExcl.size > 0) {
      txns = txns.filter(t => {
        if (!t.subcategory) return true;
        return !subExcl.has(`${t.category}::${t.subcategory}`);
      });
    }

    // Filter by year
    if (state.selectedYear !== null) {
      txns = txns.filter(t => t.year === state.selectedYear);
    }

    return txns;
  },

  getExpenseCategories() {
    return state.expenseCategories;
  },

  getIncomeCategories() {
    return state.incomeCategories;
  },

  getAllCategories() {
    return state.categories;
  },

  initGroups(categoryNames) {
    if (state.groupAssignments) {
      // Ensure any new categories get assigned to 'rest'
      const allAssigned = new Set([
        ...state.groupAssignments.mustHave,
        ...state.groupAssignments.canSave,
        ...state.groupAssignments.rest,
      ]);
      for (const name of categoryNames) {
        if (!allAssigned.has(name)) {
          state.groupAssignments.rest.push(name);
        }
      }
      // Remove categories that no longer exist
      const validNames = new Set(categoryNames);
      for (const group of ['mustHave', 'canSave', 'rest']) {
        state.groupAssignments[group] = state.groupAssignments[group].filter(n => validNames.has(n));
      }
      persistGroups();
      return;
    }

    // No saved groups — all categories start in 'rest'
    state.groupAssignments = {
      mustHave: [],
      canSave: [],
      rest: [...categoryNames],
    };
    persistGroups();
  },

  moveCategory(category, toGroup) {
    const ga = state.groupAssignments;
    for (const group of ['mustHave', 'canSave', 'rest']) {
      ga[group] = ga[group].filter(n => n !== category);
    }
    ga[toGroup].push(category);
    persistGroups();
    notify('groupAssignments', ga);
  },
};

loadPersistedState();
