import { State } from './state.js';
import {
  parseCSV,
  extractCategories,
  loadFromDataFolder,
  getLatestCSVFromIndexedDB,
  saveCSVToIndexedDB,
} from './dataLoader.js';
import { initControls } from './controls.js';
import { initGroupManager, updateGroupTotals } from './groupManager.js';
import { initCharts, renderChart, resizeCharts } from './charts.js';

async function init() {
  const loading = document.getElementById('loading');

  try {
    // Load CSV: IndexedDB first, then data/ folder
    let csvContent = null;
    let filename = '';

    const stored = await getLatestCSVFromIndexedDB();
    if (stored) {
      csvContent = stored.content;
      filename = stored.id;
    }

    if (!csvContent) {
      const fromFolder = await loadFromDataFolder();
      if (fromFolder) {
        csvContent = fromFolder.content;
        filename = fromFolder.filename;
      }
    }

    if (!csvContent) {
      loading.innerHTML = '<p style="color: #e53935;">No CSV file found. Upload one to get started.</p>';
      loading.querySelector('.spinner')?.remove();
      initUploadOnly();
      return;
    }

    await loadData(csvContent, filename);

  } catch (err) {
    console.error('Init error:', err);
    loading.innerHTML = `<p style="color: #e53935;">Error: ${err.message}</p>`;
  }
}

async function loadData(csvContent, filename) {
  const loading = document.getElementById('loading');

  const transactions = await parseCSV(csvContent);
  const { all, expense, income } = extractCategories(transactions);

  State.set('transactions', transactions);
  State.set('categories', all);
  State.set('expenseCategories', expense);
  State.set('incomeCategories', income);
  State.set('loadedFile', filename);

  // Init groups with discovered expense categories
  State.initGroups(expense.map(c => c.name));

  // Init all UI components
  initControls();
  initGroupManager();
  initCharts();

  // Listen for state changes and re-render
  const renderKeys = ['viewMode', 'groupSubView', 'selectedYear', 'selectedMonth', 'categoryFilters', 'incomeCategoryFilters', 'groupAssignments', 'subcategoryExclusions', 'lineVisibility'];
  for (const key of renderKeys) {
    State.on(key, () => {
      renderChart();
      if (['viewMode', 'selectedYear', 'groupAssignments', 'categoryFilters', 'subcategoryExclusions'].includes(key)) {
        updateGroupTotals();
      }
    });
  }

  // Initial render
  renderChart();

  // Show file info
  document.getElementById('file-info').textContent = `Loaded: ${filename} (${transactions.length.toLocaleString()} transactions)`;

  // Hide loading
  loading.classList.add('hidden');

  // Resize charts after layout settles
  requestAnimationFrame(() => resizeCharts());

  // Setup upload handler
  initUpload();

  // Resize handling
  window.addEventListener('resize', () => resizeCharts());

  // Open group accordion on desktop by default
  if (window.innerWidth >= 768) {
    document.getElementById('group-accordion').setAttribute('open', '');
    document.getElementById('filter-accordion').setAttribute('open', '');
  }
}

function initUpload() {
  const input = document.getElementById('csv-upload');
  input.addEventListener('change', handleUpload);
}

function initUploadOnly() {
  // Minimal init when no data exists
  const input = document.getElementById('csv-upload');
  input.addEventListener('change', handleUpload);

  // Show upload button prominently
  const loading = document.getElementById('loading');
  loading.innerHTML = `
    <p style="color: var(--text-muted); margin-bottom: 16px;">No CSV file found in data/ folder.</p>
    <label class="upload-btn" for="csv-upload-fallback" style="cursor: pointer; background: var(--accent); color: #111; padding: 12px 24px; border-radius: 8px; font-weight: 600;">
      Upload CSV
      <input type="file" id="csv-upload-fallback" accept=".csv" hidden>
    </label>
  `;
  document.getElementById('csv-upload-fallback')?.addEventListener('change', handleUpload);
}

async function handleUpload(e) {
  const file = e.target.files[0];
  if (!file) return;

  const loading = document.getElementById('loading');
  loading.classList.remove('hidden');
  loading.innerHTML = '<div class="spinner"></div><p>Loading data...</p>';

  try {
    const content = await file.text();
    await saveCSVToIndexedDB(file.name, content);
    // Reload the page to reinitialize cleanly
    window.location.reload();
  } catch (err) {
    console.error('Upload error:', err);
    alert('Error loading CSV: ' + err.message);
    loading.classList.add('hidden');
  }
}

init();
