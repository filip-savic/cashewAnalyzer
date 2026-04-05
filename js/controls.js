import { State } from './state.js';
import { formatEUR } from './dataLoader.js';

export function initControls() {
  initYearSelect();
  initViewTabs();
  initGroupSubTabs();
  initLineToggles();
  initFilterModeToggle();
  initCategoryFilters();
}

function initYearSelect() {
  const select = document.getElementById('year-select');
  const txns = State.get('transactions');
  const years = [...new Set(txns.map(t => t.year))].filter(Boolean).sort();

  select.innerHTML = '';
  const allOpt = document.createElement('option');
  allOpt.value = '';
  allOpt.textContent = 'All Years';
  select.appendChild(allOpt);

  for (const year of years) {
    const opt = document.createElement('option');
    opt.value = year;
    opt.textContent = year;
    select.appendChild(opt);
  }

  const currentYear = State.get('selectedYear');
  select.value = currentYear !== null ? currentYear : '';

  select.addEventListener('change', () => {
    const val = select.value;
    State.set('selectedMonth', null);
    State.set('selectedYear', val ? parseInt(val) : null);
  });

  State.on('selectedYear', (val) => {
    select.value = val !== null ? val : '';
  });
}

function initViewTabs() {
  const tabs = document.querySelectorAll('#view-tabs .view-tab');
  const currentView = State.get('viewMode');

  tabs.forEach(tab => {
    if (tab.dataset.view === currentView) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }

    tab.addEventListener('click', () => {
      State.set('selectedMonth', null);
      State.set('viewMode', tab.dataset.view);
    });
  });

  State.on('viewMode', (mode) => {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.view === mode));
    // Show/hide group sub-toggle
    document.getElementById('group-sub-toggle').classList.toggle('hidden', mode !== 'group');
    // Show/hide summary bar
    document.getElementById('summary-bar-container').classList.toggle('hidden', mode !== 'group');
  });

  // Initial state
  document.getElementById('group-sub-toggle').classList.toggle('hidden', currentView !== 'group');
  document.getElementById('summary-bar-container').classList.toggle('hidden', currentView !== 'group');
}

function initGroupSubTabs() {
  const tabs = document.querySelectorAll('#group-sub-toggle .sub-tab');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      State.set('groupSubView', tab.dataset.sub);
    });
  });

  State.on('groupSubView', (sub) => {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.sub === sub));
  });
}

function initLineToggles() {
  const container = document.getElementById('line-toggles');
  const buttons = container.querySelectorAll('.line-toggle');
  const vis = State.get('lineVisibility');

  // Sync initial state from persisted visibility
  buttons.forEach(btn => {
    const key = btn.dataset.line;
    btn.classList.toggle('active', vis[key]);
    btn.addEventListener('click', () => {
      const current = State.get('lineVisibility');
      const updated = { ...current, [key]: !current[key] };
      State.set('lineVisibility', updated);
    });
  });

  State.on('lineVisibility', (vis) => {
    buttons.forEach(btn => {
      btn.classList.toggle('active', vis[btn.dataset.line]);
    });
  });

  function updateToggleVisibility() {
    const mode = State.get('viewMode');
    const month = State.get('selectedMonth');
    // Show toggles only on year/month views (not group, not pie drilldown)
    const show = mode !== 'group' && !(mode === 'month' && month !== null);
    container.classList.toggle('hidden', !show);
  }

  State.on('viewMode', updateToggleVisibility);
  State.on('selectedMonth', updateToggleVisibility);
  updateToggleVisibility();
}

const expandedCategories = new Set();

function getActiveFilters() {
  return State.get('filterMode') === 'income'
    ? State.get('incomeCategoryFilters')
    : State.get('categoryFilters');
}

function setActiveFilters(filters) {
  if (State.get('filterMode') === 'income') {
    State.set('incomeCategoryFilters', filters);
  } else {
    State.set('categoryFilters', filters);
  }
}

function initFilterModeToggle() {
  const tabs = document.querySelectorAll('#filter-mode-toggle .filter-mode-btn');
  const currentMode = State.get('filterMode');

  tabs.forEach(tab => {
    tab.classList.toggle('active', tab.dataset.mode === currentMode);
    tab.addEventListener('click', () => {
      State.set('filterMode', tab.dataset.mode);
    });
  });

  State.on('filterMode', (mode) => {
    tabs.forEach(t => t.classList.toggle('active', t.dataset.mode === mode));
    renderFilters();
  });
}

function initCategoryFilters() {
  renderFilters();

  State.on('transactions', () => renderFilters());
  State.on('selectedYear', () => renderFilters());
  State.on('viewMode', () => renderFilters());

  document.getElementById('select-all').addEventListener('click', () => {
    State.set('subcategoryExclusions', new Set());
    setActiveFilters(null);
    renderFilters();
  });

  document.getElementById('select-none').addEventListener('click', () => {
    setActiveFilters(new Set());
    renderFilters();
  });
}

function getVisibleCategories() {
  if (State.get('filterMode') === 'income') {
    return State.getIncomeCategories();
  }
  return State.getExpenseCategories();
}

function computePeriodTotals() {
  const viewMode = State.get('viewMode');
  const selectedYear = viewMode !== 'year' ? State.get('selectedYear') : null;
  const txns = State.get('transactions').filter(t => {
    if (selectedYear !== null && t.year !== selectedYear) return false;
    return true;
  });

  const totals = {};
  const subTotals = {};
  for (const t of txns) {
    totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount);
    if (t.subcategory) {
      const subKey = `${t.category}::${t.subcategory}`;
      subTotals[subKey] = (subTotals[subKey] || 0) + Math.abs(t.amount);
    }
  }
  return { totals, subTotals };
}

function renderFilters() {
  const container = document.getElementById('category-filters');
  const categories = getVisibleCategories();
  const filters = getActiveFilters();
  const subExcl = State.get('subcategoryExclusions');
  const { totals: periodTotals, subTotals: periodSubTotals } = computePeriodTotals();

  container.innerHTML = '';

  for (const cat of categories) {
    const hasSubs = cat.subcategories && cat.subcategories.length > 0;
    const catChecked = filters === null || filters.has(cat.name);

    // How many subcategories are excluded for this category?
    const excludedSubCount = hasSubs
      ? cat.subcategories.filter(s => subExcl.has(`${cat.name}::${s.name}`)).length
      : 0;
    const someSubsExcluded = excludedSubCount > 0 && excludedSubCount < cat.subcategories.length;
    const allSubsExcluded = hasSubs && excludedSubCount === cat.subcategories.length;

    // Parent row
    const row = document.createElement('div');
    row.className = 'cat-filter-row';

    const label = document.createElement('label');
    label.className = 'cat-filter';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = catChecked && !allSubsExcluded;
    cb.indeterminate = catChecked && someSubsExcluded;
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      const current = getActiveFilters();

      if (cb.checked) {
        // Re-enable category + clear its subcategory exclusions
        const newSubExcl = new Set(State.get('subcategoryExclusions'));
        if (hasSubs) {
          for (const s of cat.subcategories) {
            newSubExcl.delete(`${cat.name}::${s.name}`);
          }
        }
        State.set('subcategoryExclusions', newSubExcl);

        if (current !== null) {
          const newFilters = new Set(current);
          newFilters.add(cat.name);
          const allNames = getVisibleCategories().map(c => c.name);
          if (allNames.every(n => newFilters.has(n))) {
            setActiveFilters(null);
          } else {
            setActiveFilters(newFilters);
          }
        }
      } else {
        // Uncheck parent → remove whole category
        if (current === null) {
          const all = getVisibleCategories().map(c => c.name);
          const newFilters = new Set(all);
          newFilters.delete(cat.name);
          setActiveFilters(newFilters);
        } else {
          const newFilters = new Set(current);
          newFilters.delete(cat.name);
          setActiveFilters(newFilters);
        }
      }
      renderFilters();
    });

    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.backgroundColor = cat.color;

    const name = document.createElement('span');
    name.className = 'cat-name';
    name.textContent = cat.name;

    const amount = document.createElement('span');
    amount.className = 'cat-amount';
    amount.textContent = formatEUR(periodTotals[cat.name] || 0);

    label.append(cb, dot, name, amount);

    // Expand toggle for categories with subcategories
    if (hasSubs) {
      const toggle = document.createElement('button');
      toggle.className = 'expand-toggle' + (expandedCategories.has(cat.name) ? ' open' : '');
      toggle.innerHTML = '\u25B6';
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (expandedCategories.has(cat.name)) {
          expandedCategories.delete(cat.name);
        } else {
          expandedCategories.add(cat.name);
        }
        renderFilters();
      });
      row.appendChild(toggle);
    }

    row.appendChild(label);
    container.appendChild(row);

    // Subcategory rows (if expanded)
    if (hasSubs && expandedCategories.has(cat.name)) {
      const subContainer = document.createElement('div');
      subContainer.className = 'cat-subs';

      for (const sub of cat.subcategories) {
        const subKey = `${cat.name}::${sub.name}`;
        const subChecked = catChecked && !subExcl.has(subKey);

        const subLabel = document.createElement('label');
        subLabel.className = 'cat-filter cat-filter-sub';

        const subCb = document.createElement('input');
        subCb.type = 'checkbox';
        subCb.checked = subChecked;
        subCb.disabled = !catChecked;
        subCb.addEventListener('change', (e) => {
          e.stopPropagation();
          const newSubExcl = new Set(State.get('subcategoryExclusions'));
          if (subCb.checked) {
            newSubExcl.delete(subKey);
          } else {
            newSubExcl.add(subKey);
          }

          // If all subcategories now excluded, uncheck parent category too
          const allExcluded = cat.subcategories.every(s => newSubExcl.has(`${cat.name}::${s.name}`));
          if (allExcluded) {
            const current = getActiveFilters();
            if (current === null) {
              const all = getVisibleCategories().map(c => c.name);
              const newFilters = new Set(all);
              newFilters.delete(cat.name);
              setActiveFilters(newFilters);
            } else {
              const newFilters = new Set(current);
              newFilters.delete(cat.name);
              setActiveFilters(newFilters);
            }
          }

          State.set('subcategoryExclusions', newSubExcl);
          renderFilters();
        });

        const subName = document.createElement('span');
        subName.className = 'cat-name';
        subName.textContent = sub.name;

        const subAmount = document.createElement('span');
        subAmount.className = 'cat-amount';
        subAmount.textContent = formatEUR(periodSubTotals[`${cat.name}::${sub.name}`] || 0);

        subLabel.append(subCb, subName, subAmount);
        subContainer.appendChild(subLabel);
      }

      container.appendChild(subContainer);
    }
  }
}

export function selectYear(year) {
  State.set('selectedYear', year);
  State.set('viewMode', 'month');
}
