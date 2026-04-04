import { State } from './state.js';
import {
  aggregateByYear,
  aggregateByMonth,
  aggregateByMonthAllYears,
  aggregateByGroup,
  aggregateGroupsByTime,
  aggregateIncomeByYear,
  aggregateIncomeByMonth,
  aggregateIncomeByMonthAllYears,
  formatEUR,
} from './dataLoader.js';
import { selectYear } from './controls.js';
import { getCPIIndex } from './inflationConfig.js';

let mainChart = null;
let summaryChart = null;

const GROUP_COLORS = {
  mustHave: '#e53935',
  canSave: '#ffb300',
  rest: '#607d8b',
};

const GROUP_LABELS = {
  mustHave: 'Must Have',
  canSave: 'Can Save',
  rest: 'Rest',
};

const INCOME_COLOR = '#66bb6a';
const INFLATION_ADJ_COLOR = '#fdd835';
const NET_COLOR_NEG = '#e53935';

const INCOME_LINE_STYLE = {
  name: 'Income',
  type: 'line',
  z: 10,
  symbol: 'circle',
  symbolSize: 6,
  lineStyle: { color: INCOME_COLOR, width: 2, type: 'solid' },
  itemStyle: { color: INCOME_COLOR },
  emphasis: { focus: 'series' },
};

const INFLATION_ADJ_LINE_STYLE = {
  name: 'Income (real)',
  type: 'line',
  z: 10,
  symbol: 'circle',
  symbolSize: 6,
  lineStyle: { color: INFLATION_ADJ_COLOR, width: 2, type: 'solid' },
  itemStyle: { color: INFLATION_ADJ_COLOR },
  emphasis: { focus: 'series' },
};

const NET_LINE_STYLE = {
  name: 'Net',
  type: 'line',
  z: 11,
  symbol: 'diamond',
  symbolSize: 5,
  lineStyle: { width: 2, type: 'dashed' },
  emphasis: { focus: 'series' },
};

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function initCharts() {
  const container = document.getElementById('chart-container');
  mainChart = echarts.init(container, 'dark');

  const summaryContainer = document.getElementById('summary-bar-container');
  summaryChart = echarts.init(summaryContainer, 'dark');

  mainChart.getZr().on('click', (params) => {
    // Handle click through for treemap/bar interactions
  });
}

export function renderChart() {
  const mode = State.get('viewMode');
  const subView = State.get('groupSubView');

  if (mode === 'year') {
    renderYearView();
  } else if (mode === 'month') {
    renderMonthView();
  } else if (mode === 'group') {
    if (subView === 'treemap') {
      renderGroupTreemap();
    } else {
      renderGroupTrend();
    }
    renderSummaryBar();
  }
}

function getCategoryColor(catName) {
  const cats = State.getAllCategories();
  const cat = cats.find(c => c.name === catName);
  return cat ? cat.color : '#78909c';
}

function getFilteredIncomeTransactions() {
  const filters = State.get('incomeCategoryFilters') ?? null;
  const subExcl = State.get('subcategoryExclusions');
  return State.get('transactions').filter(t => {
    if (!t.isIncome) return false;
    if (filters !== null && !filters.has(t.category)) return false;
    if (subExcl.size > 0 && t.subcategory && subExcl.has(`${t.category}::${t.subcategory}`)) return false;
    return true;
  });
}

function getFilteredExpenseTransactions() {
  const filters = State.get('categoryFilters');
  const showExcluded = State.get('showExcluded');
  const subExcl = State.get('subcategoryExclusions');
  return State.get('transactions').filter(t => {
    if (t.isIncome) return false;
    if (!showExcluded && State.getExcludedCategories().has(t.category)) return false;
    if (filters !== null && !filters.has(t.category)) return false;
    if (subExcl.size > 0 && t.subcategory && subExcl.has(`${t.category}::${t.subcategory}`)) return false;
    return true;
  });
}

function getCategories(txns) {
  const catSet = new Set();
  for (const t of txns) catSet.add(t.category);
  // Sort by total amount descending
  const totals = {};
  for (const t of txns) {
    totals[t.category] = (totals[t.category] || 0) + Math.abs(t.amount);
  }
  return [...catSet].sort((a, b) => (totals[b] || 0) - (totals[a] || 0));
}

// ── Year View ──

function renderYearView() {
  // For year view, ignore year filter to show all years
  const allTxns = getFilteredExpenseTransactions();

  const byYear = aggregateByYear(allTxns);
  const years = Object.keys(byYear).sort();
  const categories = getCategories(allTxns);

  // Income line (respects category filters)
  const incomeTxns = getFilteredIncomeTransactions();
  const incomeByYear = aggregateIncomeByYear(incomeTxns);

  // Expense totals per year (for net labels)
  const expenseTotalByYear = {};
  for (const y of years) {
    expenseTotalByYear[y] = Object.values(byYear[y] || {}).reduce((sum, v) => sum + v, 0);
  }

  // Can Save totals per year
  const ga = State.get('groupAssignments');
  const canSaveCats = new Set(ga?.canSave || []);
  const canSaveByYear = {};
  for (const t of allTxns) {
    if (!canSaveCats.has(t.category)) continue;
    canSaveByYear[t.year] = (canSaveByYear[t.year] || 0) + Math.abs(t.amount);
  }

  const series = categories.map(cat => ({
    name: cat,
    type: 'bar',
    stack: 'total',
    barMaxWidth: 40,
    emphasis: { focus: 'series' },
    itemStyle: { color: getCategoryColor(cat) },
    data: years.map(y => Math.round(byYear[y]?.[cat] || 0)),
  }));

  // Add income line (pure income, always green, with labels)
  series.push({
    ...INCOME_LINE_STYLE,
    data: years.map(y => Math.round(incomeByYear[y] || 0)),
    label: {
      show: true,
      position: 'top',
      backgroundColor: 'rgba(20, 20, 40, 0.85)',
      padding: [2, 4],
      borderRadius: 2,
      formatter: (params) => {
        if (!params.value) return '';
        return formatEUR(params.value);
      },
      color: INCOME_COLOR,
      fontSize: 10,
      fontWeight: 'bold',
    },
  });

  // Add inflation-adjusted income line (real purchasing power)
  const cpiIndex = getCPIIndex(years);
  series.push({
    ...INFLATION_ADJ_LINE_STYLE,
    data: years.map(y => Math.round((incomeByYear[y] || 0) / (cpiIndex[y] || 1))),
    label: {
      show: true,
      position: 'bottom',
      backgroundColor: 'rgba(20, 20, 40, 0.85)',
      padding: [2, 4],
      borderRadius: 2,
      formatter: (params) => {
        if (!params.value) return '';
        return formatEUR(params.value);
      },
      color: INFLATION_ADJ_COLOR,
      fontSize: 10,
      fontWeight: 'bold',
    },
  });

  // Add net line (income − expenses, colored by sign)
  series.push({
    ...NET_LINE_STYLE,
    data: years.map(y => {
      const income = Math.round(incomeByYear[y] || 0);
      const expense = Math.round(expenseTotalByYear[y] || 0);
      const net = income - expense;
      const color = net >= 0 ? INCOME_COLOR : NET_COLOR_NEG;
      return { value: net, itemStyle: { color }, lineStyle: { color, width: 2, type: 'dashed' } };
    }),
    label: {
      show: true,
      position: 'top',
      backgroundColor: 'rgba(10, 10, 30, 0.95)',
      padding: [4, 8],
      borderRadius: 4,
      borderColor: 'rgba(100, 140, 255, 0.4)',
      borderWidth: 1,
      formatter: (params) => {
        if (!params.value) return '';
        const tag = (params.value ?? 0) >= 0 ? 'pos' : 'neg';
        return `{${tag}|${formatEUR(params.value)}}`;
      },
      rich: {
        pos: { color: INCOME_COLOR, fontSize: 12, fontWeight: 'bold' },
        neg: { color: NET_COLOR_NEG, fontSize: 12, fontWeight: 'bold' },
      },
    },
  });

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const year = params[0].axisValue;
        let expenseTotal = 0;
        const incomeLine = params.find(p => p.seriesName === 'Income');
        const realLine = params.find(p => p.seriesName === 'Income (real)');
        const netLine = params.find(p => p.seriesName === 'Net');
        const incomeVal = incomeLine ? incomeLine.value : 0;
        const realVal = realLine ? realLine.value : 0;
        const netVal = netLine ? netLine.value : null;
        const canSaveVal = Math.round(canSaveByYear[year] || 0);
        const lines = params
          .filter(p => p.value > 0 && p.seriesName !== 'Income' && p.seriesName !== 'Income (real)' && p.seriesName !== 'Net')
          .sort((a, b) => b.value - a.value)
          .map(p => {
            expenseTotal += p.value;
            return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:4px;"></span>${p.seriesName}: ${formatEUR(p.value)}`;
          });
        let header = `<strong>${year}</strong> — Expenses: ${formatEUR(expenseTotal)}`;
        if (canSaveVal > 0) {
          header += `<br/><span style="color:${GROUP_COLORS.canSave};">Can Save: ${formatEUR(canSaveVal)}</span>`;
        }
        if (incomeVal > 0) {
          header += `<br/><span style="color:${INCOME_COLOR};">Income: ${formatEUR(incomeVal)}</span>`;
        }
        if (realVal > 0) {
          header += `<br/><span style="color:${INFLATION_ADJ_COLOR};">Income (real): ${formatEUR(realVal)}</span>`;
        }
        if (netVal !== null) {
          header += `<br/>Net: <span style="color:${netVal >= 0 ? INCOME_COLOR : NET_COLOR_NEG}">${formatEUR(netVal)}</span>`;
        }
        return `${header}<hr style="border-color:#333;margin:4px 0"/>${lines.join('<br/>')}`;
      },
      confine: true,
    },
    legend: { show: false },
    grid: {
      left: 16,
      right: 16,
      top: 28,
      bottom: 32,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: years,
      axisLabel: { color: '#8892a4' },
      axisLine: { lineStyle: { color: '#2a3550' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#8892a4',
        formatter: (v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v,
      },
      splitLine: { lineStyle: { color: '#2a3550' } },
    },
    series,
  };

  mainChart.setOption(option, true);

  // Click year to drill into month view
  mainChart.off('click');
  mainChart.on('click', (params) => {
    if (params.componentType === 'series') {
      const year = parseInt(params.name);
      if (!isNaN(year)) selectYear(year);
    }
  });
}

// ── Month View ──

function renderMonthView() {
  const selectedYear = State.get('selectedYear');
  const selectedMonth = State.get('selectedMonth');

  if (selectedMonth !== null && selectedYear !== null) {
    renderMonthPie();
  } else if (selectedYear !== null) {
    renderMonthBars(State.getFilteredTransactions());
  } else {
    renderMonthTimeSeries();
  }
}

function renderMonthBars(txns) {
  const byMonth = aggregateByMonth(txns);
  const categories = getCategories(txns);
  const selectedYear = State.get('selectedYear');

  // Income line for this year (respects category filters)
  const incomeTxns = getFilteredIncomeTransactions().filter(t => t.year === selectedYear);
  const incomeByMonth = aggregateIncomeByMonth(incomeTxns);

  // Expense totals per month (for net labels)
  const expenseTotalByMonth = {};
  for (let m = 1; m <= 12; m++) {
    expenseTotalByMonth[m] = Object.values(byMonth[m] || {}).reduce((sum, v) => sum + v, 0);
  }

  // Can Save totals per month
  const ga = State.get('groupAssignments');
  const canSaveCats = new Set(ga?.canSave || []);
  const canSaveByMonth = {};
  for (const t of txns) {
    if (!canSaveCats.has(t.category)) continue;
    canSaveByMonth[t.month] = (canSaveByMonth[t.month] || 0) + Math.abs(t.amount);
  }

  const series = categories.map(cat => ({
    name: cat,
    type: 'bar',
    stack: 'total',
    barMaxWidth: 40,
    emphasis: { focus: 'series' },
    itemStyle: { color: getCategoryColor(cat) },
    data: MONTH_NAMES.map((_, i) => Math.round(byMonth[i + 1]?.[cat] || 0)),
  }));

  // Add income line (pure income, always green, with labels)
  series.push({
    ...INCOME_LINE_STYLE,
    data: MONTH_NAMES.map((_, i) => Math.round(incomeByMonth[i + 1] || 0)),
    label: {
      show: true,
      position: 'top',
      backgroundColor: 'rgba(20, 20, 40, 0.85)',
      padding: [2, 4],
      borderRadius: 2,
      formatter: (params) => {
        if (!params.value) return '';
        return formatEUR(params.value);
      },
      color: INCOME_COLOR,
      fontSize: 10,
      fontWeight: 'bold',
    },
  });

  // Add inflation-adjusted income line (real purchasing power for this year)
  const allYears = [...new Set(State.get('transactions').map(t => t.year))].sort((a, b) => a - b);
  const cpiIndexMonth = getCPIIndex(allYears);
  const yearCPI = cpiIndexMonth[selectedYear] || 1;
  series.push({
    ...INFLATION_ADJ_LINE_STYLE,
    data: MONTH_NAMES.map((_, i) => Math.round((incomeByMonth[i + 1] || 0) / yearCPI)),
    label: {
      show: true,
      position: 'bottom',
      backgroundColor: 'rgba(20, 20, 40, 0.85)',
      padding: [2, 4],
      borderRadius: 2,
      formatter: (params) => {
        if (!params.value) return '';
        return formatEUR(params.value);
      },
      color: INFLATION_ADJ_COLOR,
      fontSize: 10,
      fontWeight: 'bold',
    },
  });

  // Add net line (income − expenses, colored by sign)
  series.push({
    ...NET_LINE_STYLE,
    data: MONTH_NAMES.map((_, i) => {
      const income = Math.round(incomeByMonth[i + 1] || 0);
      const expense = Math.round(expenseTotalByMonth[i + 1] || 0);
      const net = income - expense;
      const color = net >= 0 ? INCOME_COLOR : NET_COLOR_NEG;
      return { value: net, itemStyle: { color }, lineStyle: { color, width: 2, type: 'dashed' } };
    }),
    label: {
      show: true,
      position: 'top',
      backgroundColor: 'rgba(10, 10, 30, 0.95)',
      padding: [4, 8],
      borderRadius: 4,
      borderColor: 'rgba(100, 140, 255, 0.4)',
      borderWidth: 1,
      formatter: (params) => {
        if (!params.value) return '';
        const tag = (params.value ?? 0) >= 0 ? 'pos' : 'neg';
        return `{${tag}|${formatEUR(params.value)}}`;
      },
      rich: {
        pos: { color: INCOME_COLOR, fontSize: 12, fontWeight: 'bold' },
        neg: { color: NET_COLOR_NEG, fontSize: 12, fontWeight: 'bold' },
      },
    },
  });

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      formatter: (params) => {
        const month = params[0].axisValue;
        const monthIdx = MONTH_NAMES.indexOf(month) + 1;
        let expenseTotal = 0;
        const incomeLine = params.find(p => p.seriesName === 'Income');
        const realLine = params.find(p => p.seriesName === 'Income (real)');
        const netLine = params.find(p => p.seriesName === 'Net');
        const incomeVal = incomeLine ? incomeLine.value : 0;
        const realVal = realLine ? realLine.value : 0;
        const netVal = netLine ? netLine.value : null;
        const canSaveVal = Math.round(canSaveByMonth[monthIdx] || 0);
        const lines = params
          .filter(p => p.value > 0 && p.seriesName !== 'Income' && p.seriesName !== 'Income (real)' && p.seriesName !== 'Net')
          .sort((a, b) => b.value - a.value)
          .map(p => {
            expenseTotal += p.value;
            return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:4px;"></span>${p.seriesName}: ${formatEUR(p.value)}`;
          });
        let header = `<strong>${month} ${selectedYear}</strong> — Expenses: ${formatEUR(expenseTotal)}`;
        if (canSaveVal > 0) {
          header += `<br/><span style="color:${GROUP_COLORS.canSave};">Can Save: ${formatEUR(canSaveVal)}</span>`;
        }
        if (incomeVal > 0) {
          header += `<br/><span style="color:${INCOME_COLOR};">Income: ${formatEUR(incomeVal)}</span>`;
        }
        if (realVal > 0) {
          header += `<br/><span style="color:${INFLATION_ADJ_COLOR};">Income (real): ${formatEUR(realVal)}</span>`;
        }
        if (netVal !== null) {
          header += `<br/>Net: <span style="color:${netVal >= 0 ? INCOME_COLOR : NET_COLOR_NEG}">${formatEUR(netVal)}</span>`;
        }
        return `${header}<hr style="border-color:#333;margin:4px 0"/>${lines.join('<br/>')}`;
      },
      confine: true,
    },
    legend: { show: false },
    grid: {
      left: 16,
      right: 16,
      top: 28,
      bottom: 32,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: MONTH_NAMES,
      axisLabel: { color: '#8892a4' },
      axisLine: { lineStyle: { color: '#2a3550' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#8892a4',
        formatter: (v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v,
      },
      splitLine: { lineStyle: { color: '#2a3550' } },
    },
    series,
  };

  mainChart.setOption(option, true);
  mainChart.off('click');
  mainChart.on('click', (params) => {
    if (params.componentType === 'series' && MONTH_NAMES.includes(params.name)) {
      State.set('selectedMonth', MONTH_NAMES.indexOf(params.name) + 1);
    }
  });
}

function renderMonthPie() {
  const selectedYear = State.get('selectedYear');
  const selectedMonth = State.get('selectedMonth');
  const txns = State.getFilteredTransactions().filter(t => t.month === selectedMonth);
  const ga = State.get('groupAssignments');
  if (!ga) return;

  // Build group lookup: category → group name
  const groupLookup = {};
  for (const [group, cats] of Object.entries(ga)) {
    for (const cat of cats) groupLookup[cat] = group;
  }

  // Aggregate by category
  const catTotals = {};
  for (const t of txns) {
    catTotals[t.category] = (catTotals[t.category] || 0) + Math.abs(t.amount);
  }

  // Sort: by group order, then amount descending
  const groupOrder = { mustHave: 0, canSave: 1, rest: 2 };
  const sortedCats = Object.entries(catTotals).sort((a, b) => {
    const gA = groupOrder[groupLookup[a[0]] ?? 'rest'] ?? 2;
    const gB = groupOrder[groupLookup[b[0]] ?? 'rest'] ?? 2;
    return gA !== gB ? gA - gB : b[1] - a[1];
  });

  // Inner pie data (categories)
  const innerData = sortedCats.map(([cat, amount]) => ({
    name: cat,
    value: Math.round(amount),
    itemStyle: { color: getCategoryColor(cat) },
  }));

  // Outer ring data (groups)
  const groupTotals = { mustHave: 0, canSave: 0, rest: 0 };
  for (const [cat, amount] of sortedCats) {
    const g = groupLookup[cat] || 'rest';
    groupTotals[g] += amount;
  }
  const outerData = ['mustHave', 'canSave', 'rest']
    .filter(g => groupTotals[g] > 0)
    .map(g => ({
      name: GROUP_LABELS[g],
      value: Math.round(groupTotals[g]),
      itemStyle: { color: GROUP_COLORS[g] },
    }));

  const total = sortedCats.reduce((s, [, v]) => s + v, 0);
  const title = `${MONTH_NAMES[selectedMonth - 1]} ${selectedYear}`;

  const option = {
    backgroundColor: 'transparent',
    title: {
      text: title,
      left: 'center',
      top: 12,
      textStyle: { color: '#e8e8e8', fontSize: 16, fontWeight: 'bold' },
    },
    graphic: [{
      type: 'text',
      left: 16,
      top: 14,
      style: {
        text: '← Back',
        fill: '#4fc3f7',
        fontSize: 14,
        fontWeight: 'bold',
      },
      cursor: 'pointer',
      onclick: () => State.set('selectedMonth', null),
    }],
    tooltip: {
      formatter: (params) => {
        const pct = total > 0 ? ((params.value / total) * 100).toFixed(1) : 0;
        return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${params.color};margin-right:4px;"></span>${params.name}: ${formatEUR(params.value)} (${pct}%)`;
      },
      confine: true,
    },
    series: [
      {
        type: 'pie',
        radius: ['0%', '55%'],
        center: ['50%', '50%'],
        data: innerData,
        label: {
          color: '#e8e8e8',
          fontSize: 11,
          backgroundColor: 'rgba(20, 20, 40, 0.85)',
          padding: [2, 4],
          borderRadius: 2,
          formatter: (p) => `${p.name}\n${formatEUR(p.value)}`,
        },
        labelLine: { lineStyle: { color: '#5a6478' } },
        emphasis: {
          focus: 'self',
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        },
      },
      {
        type: 'pie',
        radius: ['58%', '68%'],
        center: ['50%', '50%'],
        data: outerData,
        label: {
          position: 'outside',
          color: '#8892a4',
          fontSize: 12,
          fontWeight: 'bold',
          backgroundColor: 'rgba(20, 20, 40, 0.85)',
          padding: [2, 4],
          borderRadius: 2,
          formatter: (p) => `${p.name}\n${formatEUR(p.value)}`,
        },
        labelLine: { lineStyle: { color: '#5a6478' } },
        emphasis: {
          focus: 'self',
          itemStyle: { shadowBlur: 10, shadowColor: 'rgba(0,0,0,0.5)' },
        },
      },
    ],
  };

  mainChart.setOption(option, true);
  mainChart.off('click');
  mainChart.on('click', () => {
    State.set('selectedMonth', null);
  });
}

function renderMonthTimeSeries() {
  // All years, show monthly time series
  const allTxns = getFilteredExpenseTransactions();

  const byMonth = aggregateByMonthAllYears(allTxns);
  const months = Object.keys(byMonth).sort();
  const categories = getCategories(allTxns);

  // Income line (respects category filters)
  const incomeTxns = getFilteredIncomeTransactions();
  const incomeByMonth = aggregateIncomeByMonthAllYears(incomeTxns);

  // Can Save totals per year-month
  const ga = State.get('groupAssignments');
  const canSaveCats = new Set(ga?.canSave || []);
  const canSaveByMonth = {};
  for (const t of allTxns) {
    if (!canSaveCats.has(t.category)) continue;
    const key = `${t.year}-${String(t.month).padStart(2, '0')}`;
    canSaveByMonth[key] = (canSaveByMonth[key] || 0) + Math.abs(t.amount);
  }

  const series = categories.map(cat => ({
    name: cat,
    type: 'bar',
    stack: 'total',
    barMaxWidth: 16,
    emphasis: { focus: 'series' },
    itemStyle: { color: getCategoryColor(cat) },
    data: months.map(m => Math.round(byMonth[m]?.[cat] || 0)),
  }));

  // Expense totals per month for net calculation
  const expenseTotalByMonthAll = {};
  for (const m of months) {
    expenseTotalByMonthAll[m] = Object.values(byMonth[m] || {}).reduce((sum, v) => sum + v, 0);
  }

  // Add income line (pure income, always green)
  series.push({
    ...INCOME_LINE_STYLE,
    label: { show: false },
    data: months.map(m => Math.round(incomeByMonth[m] || 0)),
  });

  // Add inflation-adjusted income line (real purchasing power)
  const tsYears = [...new Set(months.map(m => parseInt(m.split('-')[0])))].sort((a, b) => a - b);
  const cpiIndexTS = getCPIIndex(tsYears);
  series.push({
    ...INFLATION_ADJ_LINE_STYLE,
    label: { show: false },
    data: months.map(m => {
      const y = parseInt(m.split('-')[0]);
      return Math.round((incomeByMonth[m] || 0) / (cpiIndexTS[y] || 1));
    }),
  });

  // Add net line (income − expenses, colored by sign)
  series.push({
    ...NET_LINE_STYLE,
    label: { show: false },
    data: months.map(m => {
      const income = Math.round(incomeByMonth[m] || 0);
      const expense = Math.round(expenseTotalByMonthAll[m] || 0);
      const net = income - expense;
      const color = net >= 0 ? INCOME_COLOR : NET_COLOR_NEG;
      return { value: net, itemStyle: { color }, lineStyle: { color, width: 2, type: 'dashed' } };
    }),
  });

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      formatter: (params) => {
        const month = params[0].axisValue;
        let expenseTotal = 0;
        const incomeLine = params.find(p => p.seriesName === 'Income');
        const realLine = params.find(p => p.seriesName === 'Income (real)');
        const netLine = params.find(p => p.seriesName === 'Net');
        const incomeVal = incomeLine ? incomeLine.value : 0;
        const realVal = realLine ? realLine.value : 0;
        const netVal = netLine ? netLine.value : null;
        const canSaveVal = Math.round(canSaveByMonth[month] || 0);
        const lines = params
          .filter(p => p.value > 0 && p.seriesName !== 'Income' && p.seriesName !== 'Income (real)' && p.seriesName !== 'Net')
          .sort((a, b) => b.value - a.value)
          .slice(0, 8)
          .map(p => {
            expenseTotal += p.value;
            return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:4px;"></span>${p.seriesName}: ${formatEUR(p.value)}`;
          });
        const remaining = params.filter(p => p.value > 0 && p.seriesName !== 'Income' && p.seriesName !== 'Income (real)' && p.seriesName !== 'Net').length - lines.length;
        if (remaining > 0) lines.push(`<span style="color:#8892a4">+${remaining} more</span>`);
        let header = `<strong>${month}</strong> — Expenses: ${formatEUR(expenseTotal)}`;
        if (canSaveVal > 0) {
          header += `<br/><span style="color:${GROUP_COLORS.canSave};">Can Save: ${formatEUR(canSaveVal)}</span>`;
        }
        if (incomeVal > 0) {
          header += `<br/><span style="color:${INCOME_COLOR};">Income: ${formatEUR(incomeVal)}</span>`;
        }
        if (realVal > 0) {
          header += `<br/><span style="color:${INFLATION_ADJ_COLOR};">Income (real): ${formatEUR(realVal)}</span>`;
        }
        if (netVal !== null) {
          header += `<br/>Net: <span style="color:${netVal >= 0 ? INCOME_COLOR : NET_COLOR_NEG}">${formatEUR(netVal)}</span>`;
        }
        return `${header}<hr style="border-color:#333;margin:4px 0"/>${lines.join('<br/>')}`;
      },
    },
    legend: { show: false },
    grid: {
      left: 16,
      right: 16,
      top: 16,
      bottom: 32,
      containLabel: true,
    },
    dataZoom: [{
      type: 'inside',
      start: Math.max(0, 100 - (24 / months.length) * 100),
      end: 100,
    }, {
      type: 'slider',
      height: 20,
      bottom: 4,
      borderColor: '#2a3550',
      fillerColor: 'rgba(79, 195, 247, 0.15)',
      handleStyle: { color: '#4fc3f7' },
      textStyle: { color: '#8892a4' },
    }],
    xAxis: {
      type: 'category',
      data: months,
      axisLabel: {
        color: '#8892a4',
        rotate: 45,
        fontSize: 10,
      },
      axisLine: { lineStyle: { color: '#2a3550' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#8892a4',
        formatter: (v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v,
      },
      splitLine: { lineStyle: { color: '#2a3550' } },
    },
    series,
  };

  mainChart.setOption(option, true);
  mainChart.off('click');
}

// ── Group Treemap ──

function renderGroupTreemap() {
  const txns = State.getFilteredTransactions();
  const ga = State.get('groupAssignments');
  if (!ga) return;

  const data = aggregateByGroup(txns, ga);
  const grandTotal = data.mustHave.total + data.canSave.total + data.rest.total;

  const treemapData = ['mustHave', 'canSave', 'rest'].map(groupKey => ({
    name: GROUP_LABELS[groupKey],
    value: Math.round(data[groupKey].total),
    itemStyle: {
      color: GROUP_COLORS[groupKey],
      borderColor: '#1a1a2e',
      borderWidth: 3,
    },
    children: Object.entries(data[groupKey].categories)
      .sort(([, a], [, b]) => b - a)
      .map(([catName, amount]) => ({
        name: catName,
        value: Math.round(amount),
        itemStyle: {
          color: getCategoryColor(catName),
        },
      })),
  })).filter(g => g.value > 0);

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params) => {
        const pct = grandTotal > 0 ? ((params.value / grandTotal) * 100).toFixed(1) : 0;
        if (params.treePathInfo && params.treePathInfo.length > 2) {
          const groupName = params.treePathInfo[1]?.name || '';
          return `<strong>${params.name}</strong><br/>${groupName}<br/>${formatEUR(params.value)} (${pct}%)`;
        }
        return `<strong>${params.name}</strong><br/>${formatEUR(params.value)} (${pct}%)`;
      },
      confine: true,
    },
    series: [{
      type: 'treemap',
      width: '100%',
      height: '100%',
      roam: false,
      nodeClick: false,
      breadcrumb: { show: false },
      data: treemapData,
      levels: [
        {
          // root
          itemStyle: {
            borderColor: '#1a1a2e',
            borderWidth: 0,
            gapWidth: 4,
          },
        },
        {
          // group level
          itemStyle: {
            borderColor: '#1a1a2e',
            borderWidth: 3,
            gapWidth: 2,
          },
          upperLabel: {
            show: true,
            height: 32,
            color: '#fff',
            fontSize: 14,
            fontWeight: 'bold',
            formatter: (params) => {
              const pct = grandTotal > 0 ? ((params.value / grandTotal) * 100).toFixed(0) : 0;
              return `${params.name}  ${formatEUR(params.value)}  (${pct}%)`;
            },
          },
        },
        {
          // category level
          itemStyle: {
            borderColor: 'rgba(26, 26, 46, 0.6)',
            borderWidth: 1,
            gapWidth: 1,
          },
          label: {
            show: true,
            color: '#fff',
            fontSize: 12,
            formatter: (params) => `${params.name}\n${formatEUR(params.value)}`,
          },
        },
      ],
    }],
  };

  mainChart.setOption(option, true);
  mainChart.off('click');
}

// ── Group Time Trend ──

function renderGroupTrend() {
  const txns = State.getFilteredTransactions();
  const ga = State.get('groupAssignments');
  if (!ga) return;

  const selectedYear = State.get('selectedYear');
  const byYear = selectedYear !== null;

  // For trend, use unfiltered-by-year data
  const allTxns = getFilteredExpenseTransactions();

  const data = aggregateGroupsByTime(allTxns, ga, true);
  const keys = Object.keys(data).sort();

  const series = ['mustHave', 'canSave', 'rest'].map(groupKey => ({
    name: GROUP_LABELS[groupKey],
    type: 'bar',
    stack: 'total',
    barMaxWidth: 50,
    emphasis: { focus: 'series' },
    itemStyle: { color: GROUP_COLORS[groupKey] },
    data: keys.map(k => Math.round(data[k]?.[groupKey] || 0)),
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      confine: true,
      formatter: (params) => {
        const period = params[0].axisValue;
        let total = 0;
        const lines = params
          .filter(p => p.value > 0)
          .map(p => {
            total += p.value;
            return `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${p.color};margin-right:4px;"></span>${p.seriesName}: ${formatEUR(p.value)}`;
          });
        return `<strong>${period}</strong> (${formatEUR(total)})<br/>${lines.join('<br/>')}`;
      },
    },
    legend: {
      data: Object.values(GROUP_LABELS),
      textStyle: { color: '#8892a4' },
      top: 0,
    },
    grid: {
      left: 16,
      right: 16,
      top: 40,
      bottom: 32,
      containLabel: true,
    },
    xAxis: {
      type: 'category',
      data: keys,
      axisLabel: { color: '#8892a4' },
      axisLine: { lineStyle: { color: '#2a3550' } },
    },
    yAxis: {
      type: 'value',
      axisLabel: {
        color: '#8892a4',
        formatter: (v) => v >= 1000 ? `${Math.round(v / 1000)}k` : v,
      },
      splitLine: { lineStyle: { color: '#2a3550' } },
    },
    series,
  };

  mainChart.setOption(option, true);
  mainChart.off('click');
}

// ── Summary Bar ──

function renderSummaryBar() {
  const txns = State.getFilteredTransactions();
  const ga = State.get('groupAssignments');
  if (!ga) return;

  const data = aggregateByGroup(txns, ga);
  const total = data.mustHave.total + data.canSave.total + data.rest.total;

  if (total === 0) {
    summaryChart.clear();
    return;
  }

  const pieces = ['mustHave', 'canSave', 'rest'].map(g => ({
    value: data[g].total,
    itemStyle: { color: GROUP_COLORS[g] },
    name: GROUP_LABELS[g],
  }));

  const option = {
    backgroundColor: 'transparent',
    tooltip: {
      formatter: (params) => {
        const pct = ((params.value / total) * 100).toFixed(1);
        return `${params.name}: ${formatEUR(params.value)} (${pct}%)`;
      },
      confine: true,
    },
    xAxis: {
      type: 'value',
      show: false,
      max: total,
    },
    yAxis: {
      type: 'category',
      data: [''],
      show: false,
    },
    grid: {
      left: 0,
      right: 0,
      top: 4,
      bottom: 4,
    },
    series: pieces.map(p => ({
      type: 'bar',
      stack: 'summary',
      data: [Math.round(p.value)],
      name: p.name,
      itemStyle: p.itemStyle,
      barWidth: '100%',
      label: {
        show: p.value / total > 0.08,
        position: 'inside',
        formatter: () => {
          const pct = ((p.value / total) * 100).toFixed(0);
          return `${p.name} ${pct}%`;
        },
        color: '#fff',
        fontSize: 11,
        fontWeight: 'bold',
      },
    })),
  };

  summaryChart.setOption(option, true);
}

export function resizeCharts() {
  if (mainChart) mainChart.resize();
  if (summaryChart) summaryChart.resize();
}
