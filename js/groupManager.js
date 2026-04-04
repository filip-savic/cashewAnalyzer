import { State } from './state.js';
import { formatEUR } from './dataLoader.js';

let selectedCategory = null;
let categoryTotals = {};

export function initGroupManager() {
  computeTotals();
  render();

  State.on('groupAssignments', () => render());
  State.on('transactions', () => {
    computeTotals();
    render();
  });

  // Click outside to deselect
  document.addEventListener('click', (e) => {
    if (selectedCategory && !e.target.closest('.cat-pill') && !e.target.closest('.move-target-bar')) {
      selectedCategory = null;
      render();
    }
  });

  // Desktop drag & drop on lanes
  for (const groupKey of ['mustHave', 'canSave', 'rest']) {
    const lane = document.querySelector(`.group-lane[data-group="${groupKey}"]`);
    lane.addEventListener('dragover', (e) => {
      e.preventDefault();
      lane.classList.add('drag-over');
    });
    lane.addEventListener('dragleave', () => {
      lane.classList.remove('drag-over');
    });
    lane.addEventListener('drop', (e) => {
      e.preventDefault();
      lane.classList.remove('drag-over');
      const cat = e.dataTransfer.getData('text/plain');
      if (cat) {
        State.moveCategory(cat, groupKey);
        selectedCategory = null;
      }
    });
  }
}

function computeTotals() {
  categoryTotals = {};
  const txns = State.get('transactions').filter(t => !t.isIncome && !State.EXCLUDED_CATEGORIES.includes(t.category));
  const viewMode = State.get('viewMode');
  const selectedYear = viewMode !== 'year' ? State.get('selectedYear') : null;

  for (const t of txns) {
    if (selectedYear !== null && t.year !== selectedYear) continue;
    if (!categoryTotals[t.category]) categoryTotals[t.category] = 0;
    categoryTotals[t.category] += Math.abs(t.amount);
  }
}

function render() {
  const ga = State.get('groupAssignments');
  if (!ga) return;

  for (const groupKey of ['mustHave', 'canSave', 'rest']) {
    const pillsContainer = document.getElementById(`pills-${groupKey}`);
    const totalEl = document.getElementById(`total-${groupKey}`);

    pillsContainer.innerHTML = '';
    let groupTotal = 0;

    for (const catName of ga[groupKey]) {
      const amount = categoryTotals[catName] || 0;
      groupTotal += amount;

      const pill = document.createElement('div');
      pill.className = 'cat-pill' + (selectedCategory === catName ? ' selected' : '');
      pill.draggable = true;

      // Find category color
      const cats = State.getAllExpenseCategories();
      const catInfo = cats.find(c => c.name === catName);
      const color = catInfo ? catInfo.color : '#78909c';

      pill.innerHTML = `
        <span class="dot" style="background-color: ${color}"></span>
        <span>${catName}</span>
        <span class="pill-amount">${formatEUR(amount)}</span>
      `;

      // Tap to select
      pill.addEventListener('click', (e) => {
        e.stopPropagation();
        if (selectedCategory === catName) {
          selectedCategory = null;
        } else {
          selectedCategory = catName;
        }
        render();
      });

      // Desktop drag start
      pill.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', catName);
        e.dataTransfer.effectAllowed = 'move';
        pill.style.opacity = '0.5';
      });
      pill.addEventListener('dragend', () => {
        pill.style.opacity = '';
      });

      pillsContainer.appendChild(pill);
    }

    totalEl.textContent = formatEUR(groupTotal);
  }

  // Render move target bar
  renderMoveTargets();
}

function renderMoveTargets() {
  const bar = document.getElementById('move-targets');

  if (!selectedCategory) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }

  // Find which group the selected category is in
  const ga = State.get('groupAssignments');
  let currentGroup = null;
  for (const g of ['mustHave', 'canSave', 'rest']) {
    if (ga[g].includes(selectedCategory)) {
      currentGroup = g;
      break;
    }
  }

  bar.classList.remove('hidden');
  bar.innerHTML = `
    <span style="font-size: 0.8rem; color: var(--text-muted); align-self: center; white-space: nowrap;">Move <strong>${selectedCategory}</strong> to:</span>
    <button class="move-btn must-have-btn ${currentGroup === 'mustHave' ? 'current' : ''}" data-target="mustHave">Must Have</button>
    <button class="move-btn can-save-btn ${currentGroup === 'canSave' ? 'current' : ''}" data-target="canSave">Can Save</button>
    <button class="move-btn rest-btn ${currentGroup === 'rest' ? 'current' : ''}" data-target="rest">Rest</button>
  `;

  bar.querySelectorAll('.move-btn:not(.current)').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      State.moveCategory(selectedCategory, btn.dataset.target);
      selectedCategory = null;
    });
  });
}

export function updateGroupTotals() {
  computeTotals();
  render();
}
