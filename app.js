'use strict';

/* ============================================================
   STATE
   ============================================================ */

let state = {
  projects: [],
  activeProjectId: null
};

/* ============================================================
   PERSISTENCE
   ============================================================ */

const uid = () => '_' + Math.random().toString(36).slice(2, 10);

function save() {
  localStorage.setItem('roadmaphub_v2', JSON.stringify(state));
}

function load() {
  try {
    // migrate from v1
    const old = localStorage.getItem('roadmaphub_v1');
    if (old && !localStorage.getItem('roadmaphub_v2')) {
      const parsed = JSON.parse(old);
      // add new fields
      parsed.projects = (parsed.projects || []).map(p => ({
        tags: [],
        ...p,
        phases: (p.phases || []).map(ph => ({
          startDate: '', endDate: '', notes: '',
          ...ph,
          tasks: (ph.tasks || []).map(t => ({ tagIds: [], ...t }))
        }))
      }));
      state = parsed;
      save();
      return;
    }
    const raw = localStorage.getItem('roadmaphub_v2');
    if (raw) state = JSON.parse(raw);
  } catch (_) { /* ignore */ }
}

function activeProject() {
  return state.projects.find(p => p.id === state.activeProjectId) || null;
}

/* ============================================================
   BOOT
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  load();
  bindStaticEvents();
  render();
});

function initIcons() {
  setTimeout(() => window.lucide && window.lucide.createIcons(), 0);
}

/* ============================================================
   RENDER
   ============================================================ */

function render() {
  renderSidebar();
  renderMain();
  initIcons();
}

/* ---- SIDEBAR ---- */

function renderSidebar() {
  const list = document.getElementById('projectList');
  list.innerHTML = '';

  state.projects.forEach(proj => {
    const totalTasks = proj.phases.reduce((s, ph) => s + ph.tasks.length, 0);
    const doneTasks  = proj.phases.reduce((s, ph) => s + ph.tasks.filter(t => t.done).length, 0);
    const phaseCount = proj.phases.length;

    const li = document.createElement('li');
    li.className = 'project-item' + (proj.id === state.activeProjectId ? ' active' : '');
    li.dataset.id = proj.id;
    li.innerHTML = `
      <span class="proj-emoji">${proj.emoji}</span>
      <div class="proj-info">
        <div class="proj-name">${escHtml(proj.name)}</div>
        <div class="proj-phases">${phaseCount} fase${phaseCount !== 1 ? 's' : ''} · ${doneTasks}/${totalTasks} tarefas</div>
      </div>
      <span class="proj-dot" style="background:${proj.color}"></span>
    `;
    li.addEventListener('click', () => selectProject(proj.id));
    list.appendChild(li);
  });
}

/* ---- MAIN ---- */

function renderMain() {
  const proj = activeProject();
  document.getElementById('emptyState').style.display  = proj ? 'none' : '';
  document.getElementById('projectView').style.display = proj ? '' : 'none';
  if (!proj) return;

  // Header
  document.getElementById('viewEmoji').textContent    = proj.emoji;
  document.getElementById('viewTitle').textContent    = proj.name;
  document.getElementById('viewSubtitle').textContent = proj.desc || 'Sem descrição';

  // Accent color
  document.documentElement.style.setProperty('--accent',       proj.color);
  document.documentElement.style.setProperty('--accent-light', hexToRgba(proj.color, 0.15));
  document.documentElement.style.setProperty('--accent-glow',  hexToRgba(proj.color, 0.30));

  // Progress
  const allTasks = proj.phases.flatMap(ph => ph.tasks);
  const done     = allTasks.filter(t => t.done).length;
  const total    = allTasks.length;
  const pct      = total ? Math.round((done / total) * 100) : 0;

  document.getElementById('globalPct').textContent   = pct + '%';
  document.getElementById('globalBar').style.width   = pct + '%';
  document.getElementById('progressStats').textContent =
    `${done} de ${total} tarefa${total !== 1 ? 's' : ''} concluída${total !== 1 ? 's' : ''}`;

  renderTimeline(proj);
  renderPhases(proj);
}

/* ---- TIMELINE ---- */

function renderTimeline(proj) {
  const wrap = document.getElementById('timelineWrapper');
  const dots = document.getElementById('timelineDots');
  dots.innerHTML = '';

  if (proj.phases.length === 0) { wrap.style.display = 'none'; return; }
  wrap.style.display = '';

  proj.phases.forEach((ph, idx) => {
    const total   = ph.tasks.length;
    const done    = ph.tasks.filter(t => t.done).length;
    const isDone  = total > 0 && done === total;
    const isInProg= done > 0 && !isDone;

    const dot = document.createElement('div');
    dot.className = 'timeline-dot' + (isDone ? ' done' : isInProg ? ' in-progress' : '');
    dot.innerHTML = `
      <div class="timeline-dot-circle">${isDone ? '✓' : idx + 1}</div>
      <div class="timeline-dot-label">${escHtml(shortText(ph.name, 14))}</div>
    `;
    dot.addEventListener('click', () => {
      document.getElementById('phase-' + ph.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    dots.appendChild(dot);
  });
}

/* ---- PHASES ---- */

function renderPhases(proj) {
  const container = document.getElementById('phasesContainer');
  container.innerHTML = '';

  proj.phases.forEach((ph, idx) => {
    const total = ph.tasks.length;
    const done  = ph.tasks.filter(t => t.done).length;
    const pct   = total ? Math.round((done / total) * 100) : 0;

    const card = document.createElement('div');
    card.className = 'phase-card' + (ph.collapsed ? ' collapsed' : '');
    card.id = 'phase-' + ph.id;
    card.draggable = true;

    // Date badges
    const dateBadgesHTML = buildDateBadges(ph, pct);

    card.innerHTML = `
      <div class="phase-header" id="phase-hdr-${ph.id}">
        <div class="drag-handle" data-drag="${ph.id}" title="Arrastar para reordenar">
          <i data-lucide="grip-vertical"></i>
        </div>
        <div class="phase-number">${idx + 1}</div>
        <div class="phase-title-wrap">
          <div class="phase-name">${escHtml(ph.name)}</div>
          ${ph.desc ? `<div class="phase-desc">${escHtml(ph.desc)}</div>` : ''}
          ${dateBadgesHTML}
        </div>
        <div class="phase-header-right">
          <div class="phase-actions">
            <button class="btn-icon" data-action="edit-phase" data-id="${ph.id}" title="Editar fase">
              <i data-lucide="pencil"></i>
            </button>
            <button class="btn-icon btn-danger" data-action="delete-phase" data-id="${ph.id}" title="Excluir fase">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
          <div class="phase-mini-bar">
            <div class="phase-mini-bar-fill" style="width:${pct}%"></div>
          </div>
          <span class="phase-pct" style="color:${pctColor(pct)}">${pct}%</span>
          <i data-lucide="chevron-right" class="phase-chevron"></i>
        </div>
      </div>
      <div class="phase-body">
        <div class="task-list" id="tasks-${ph.id}">
          ${renderTasksHTML(ph, proj)}
        </div>
        <div class="add-task-row">
          <input type="text" class="add-task-input" id="taskInput-${ph.id}"
            placeholder="Nova tarefa... (Enter para adicionar)" maxlength="120" />
          <button class="btn-add-task" data-action="add-task" data-phaseid="${ph.id}">Adicionar</button>
        </div>
        <div class="phase-notes-wrap">
          <div class="phase-notes-label">
            <i data-lucide="file-text"></i> Notas
          </div>
          <textarea class="phase-notes-textarea" id="notes-${ph.id}"
            placeholder="Anotações, links, referências..."
            rows="2">${escHtml(ph.notes || '')}</textarea>
        </div>
      </div>
    `;

    // Header click → toggle collapse
    card.querySelector(`#phase-hdr-${ph.id}`).addEventListener('click', (e) => {
      if (e.target.closest('[data-action]') || e.target.closest('.drag-handle')) return;
      togglePhaseCollapse(ph.id);
    });

    // Edit / delete buttons
    card.querySelectorAll('[data-action="edit-phase"]').forEach(btn =>
      btn.addEventListener('click', (e) => { e.stopPropagation(); openEditPhase(ph.id); })
    );
    card.querySelectorAll('[data-action="delete-phase"]').forEach(btn =>
      btn.addEventListener('click', (e) => { e.stopPropagation(); confirmDeletePhase(ph.id); })
    );

    // Add task
    card.querySelector('[data-action="add-task"]').addEventListener('click', () => addTask(ph.id));
    card.querySelector(`#taskInput-${ph.id}`).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') addTask(ph.id);
    });

    // Notes auto-save
    let notesTimer;
    card.querySelector(`#notes-${ph.id}`).addEventListener('input', (e) => {
      clearTimeout(notesTimer);
      notesTimer = setTimeout(() => {
        const p = activeProject();
        const phase = p?.phases.find(x => x.id === ph.id);
        if (phase) { phase.notes = e.target.value; save(); renderSidebar(); }
      }, 400);
    });

    // Drag & drop
    setupPhaseDrag(card, ph.id, proj);

    container.appendChild(card);
  });

  bindTaskEvents(proj);
}

function buildDateBadges(ph, pct) {
  if (!ph.startDate && !ph.endDate) return '';
  const now = new Date(); now.setHours(0,0,0,0);
  let html = '<div class="phase-dates">';
  if (ph.startDate) {
    html += `<span class="phase-date-badge"><i data-lucide="calendar"></i>${formatDate(ph.startDate)}</span>`;
  }
  if (ph.endDate) {
    const end = new Date(ph.endDate + 'T00:00:00');
    const overdue = end < now && pct < 100;
    const done    = pct === 100;
    html += `<span class="phase-date-badge ${overdue ? 'overdue' : done ? 'completed' : ''}">
      <i data-lucide="${overdue ? 'alert-triangle' : done ? 'check-circle' : 'flag'}"></i>
      ${overdue ? 'Atrasado · ' : ''}${formatDate(ph.endDate)}
    </span>`;
  }
  return html + '</div>';
}

function renderTasksHTML(ph, proj) {
  if (ph.tasks.length === 0) {
    return `<div style="padding:8px 12px;font-size:13px;color:var(--text-muted)">Nenhuma tarefa ainda. Adicione abaixo!</div>`;
  }
  return ph.tasks.map(t => {
    const tagPills = (t.tagIds || []).map(tid => {
      const tag = proj.tags?.find(tg => tg.id === tid);
      if (!tag) return '';
      return `<span class="tag-pill" style="color:${tag.color};border-color:${hexToRgba(tag.color, 0.35)};background:${hexToRgba(tag.color, 0.12)}" data-action="open-tags" data-tid="${t.id}" data-pid="${ph.id}">${escHtml(tag.name)}</span>`;
    }).join('');

    return `
      <div class="task-item${t.done ? ' done' : ''}" data-task-id="${t.id}" data-phase-id="${ph.id}">
        <div class="task-checkbox${t.done ? ' checked' : ''}"
          data-action="toggle-task" data-tid="${t.id}" data-pid="${ph.id}"></div>
        <div class="task-content">
          <div class="task-name">${escHtml(t.name)}</div>
          ${tagPills ? `<div class="task-tags">${tagPills}</div>` : ''}
        </div>
        <div class="task-actions">
          <button class="task-action-btn" data-action="open-tags" data-tid="${t.id}" data-pid="${ph.id}" title="Tags">
            <i data-lucide="tag"></i>
          </button>
          <button class="task-action-btn danger" data-action="delete-task" data-tid="${t.id}" data-pid="${ph.id}" title="Remover">
            <i data-lucide="x"></i>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function bindTaskEvents(proj) {
  document.querySelectorAll('[data-action="toggle-task"]').forEach(el => {
    el.addEventListener('click', () => toggleTask(el.dataset.pid, el.dataset.tid));
  });
  document.querySelectorAll('[data-action="delete-task"]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); deleteTask(el.dataset.pid, el.dataset.tid); });
  });
  document.querySelectorAll('[data-action="open-tags"]').forEach(el => {
    el.addEventListener('click', (e) => { e.stopPropagation(); openTagPopover(e, el.dataset.pid, el.dataset.tid); });
  });
}

/* ============================================================
   DRAG & DROP (phases)
   ============================================================ */

let _dragSourceId = null;

function setupPhaseDrag(card, phaseId, proj) {
  card.addEventListener('dragstart', (e) => {
    _dragSourceId = phaseId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });

  card.addEventListener('dragend', () => {
    card.classList.remove('dragging');
    document.querySelectorAll('.phase-card').forEach(c => c.classList.remove('drag-over'));
    document.querySelectorAll('.drop-indicator').forEach(d => d.remove());
  });

  card.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (_dragSourceId === phaseId) return;
    e.dataTransfer.dropEffect = 'move';
    document.querySelectorAll('.phase-card').forEach(c => c.classList.remove('drag-over'));
    card.classList.add('drag-over');
  });

  card.addEventListener('dragleave', (e) => {
    if (!card.contains(e.relatedTarget)) card.classList.remove('drag-over');
  });

  card.addEventListener('drop', (e) => {
    e.preventDefault();
    card.classList.remove('drag-over');
    if (!_dragSourceId || _dragSourceId === phaseId) return;

    const p = activeProject();
    if (!p) return;

    const fromIdx = p.phases.findIndex(x => x.id === _dragSourceId);
    const toIdx   = p.phases.findIndex(x => x.id === phaseId);
    if (fromIdx === -1 || toIdx === -1) return;

    const [moved] = p.phases.splice(fromIdx, 1);
    p.phases.splice(toIdx, 0, moved);
    _dragSourceId = null;
    save();
    render();
  });
}

/* ============================================================
   ACTIONS
   ============================================================ */

function selectProject(id) {
  state.activeProjectId = id;
  save();
  render();
}

function togglePhaseCollapse(phaseId) {
  const proj = activeProject();
  const ph = proj?.phases.find(p => p.id === phaseId);
  if (ph) { ph.collapsed = !ph.collapsed; save(); render(); }
}

function toggleTask(phaseId, taskId) {
  const proj = activeProject();
  const ph   = proj?.phases.find(p => p.id === phaseId);
  const task = ph?.tasks.find(t => t.id === taskId);
  if (task) { task.done = !task.done; save(); render(); }
}

function addTask(phaseId) {
  const inp  = document.getElementById('taskInput-' + phaseId);
  const name = inp?.value.trim();
  if (!name) return;
  const proj = activeProject();
  const ph   = proj?.phases.find(p => p.id === phaseId);
  if (ph) {
    ph.tasks.push({ id: uid(), name, done: false, tagIds: [] });
    save();
    render();
    document.getElementById('taskInput-' + phaseId)?.focus();
  }
}

function deleteTask(phaseId, taskId) {
  const proj = activeProject();
  const ph   = proj?.phases.find(p => p.id === phaseId);
  if (ph) { ph.tasks = ph.tasks.filter(t => t.id !== taskId); save(); render(); }
}

function deletePhase(phaseId) {
  const proj = activeProject();
  if (proj) { proj.phases = proj.phases.filter(p => p.id !== phaseId); save(); render(); }
}

function deleteProject(projectId) {
  state.projects = state.projects.filter(p => p.id !== projectId);
  if (state.activeProjectId === projectId) {
    state.activeProjectId = state.projects[0]?.id || null;
  }
  save();
  render();
}

/* ============================================================
   TAG POPOVER
   ============================================================ */

const TAG_COLORS = ['#6C63FF','#00C9A7','#FF6584','#F7B731','#45AAF2','#FD9644','#A29BFE','#26DE81'];
let _tagPopoverPhaseId = null;
let _tagPopoverTaskId  = null;
let _tagPopoverOpen    = false;

function openTagPopover(event, phaseId, taskId) {
  const proj = activeProject();
  if (!proj) return;

  _tagPopoverPhaseId = phaseId;
  _tagPopoverTaskId  = taskId;
  _tagPopoverOpen    = true;

  const task  = proj.phases.find(p => p.id === phaseId)?.tasks.find(t => t.id === taskId);
  const pop   = document.getElementById('tagPopover');
  const list  = document.getElementById('tagPopoverList');
  const input = document.getElementById('tagPopoverInput');
  const colorDots = document.getElementById('tagPopoverColors');

  // Build tag list
  list.innerHTML = '';
  if (!proj.tags || proj.tags.length === 0) {
    list.innerHTML = '<div class="tag-popover-empty">Nenhuma tag criada. Crie abaixo!</div>';
  } else {
    proj.tags.forEach(tag => {
      const isChecked = (task?.tagIds || []).includes(tag.id);
      const item = document.createElement('div');
      item.className = 'tag-popover-item' + (isChecked ? ' checked' : '');
      item.innerHTML = `
        <span class="tag-dot" style="background:${tag.color}"></span>
        <span class="tag-popover-name">${escHtml(tag.name)}</span>
        ${isChecked ? '<span class="tag-popover-check">✓</span>' : ''}
      `;
      item.addEventListener('click', () => toggleTaskTag(phaseId, taskId, tag.id));
      list.appendChild(item);
    });
  }

  // Color dots for new tag
  buildColorDots(colorDots);
  input.value = '';

  // Position popover
  pop.style.display = 'block';
  const rect = event.target.closest('.task-item')?.getBoundingClientRect()
            || event.target.getBoundingClientRect();
  const popW = 240;
  let left = rect.left;
  let top  = rect.bottom + 6;
  if (left + popW > window.innerWidth - 12) left = window.innerWidth - popW - 12;
  if (top + 260 > window.innerHeight) top = rect.top - 270;
  pop.style.left = left + 'px';
  pop.style.top  = top + 'px';

  initIcons();
  setTimeout(() => input.focus(), 80);
}

function closeTagPopover() {
  document.getElementById('tagPopover').style.display = 'none';
  _tagPopoverOpen = false;
  _tagPopoverPhaseId = null;
  _tagPopoverTaskId  = null;
}

function toggleTaskTag(phaseId, taskId, tagId) {
  const proj = activeProject();
  const task = proj?.phases.find(p => p.id === phaseId)?.tasks.find(t => t.id === taskId);
  if (!task) return;
  task.tagIds = task.tagIds || [];
  const idx = task.tagIds.indexOf(tagId);
  if (idx === -1) task.tagIds.push(tagId); else task.tagIds.splice(idx, 1);
  save();
  // re-open to reflect change
  openTagPopover({ target: document.querySelector(`[data-action="open-tags"][data-tid="${taskId}"]`) || document.body }, phaseId, taskId);
  renderMain();
}

function createTagInPopover() {
  const proj = activeProject();
  if (!proj) return;
  const input = document.getElementById('tagPopoverInput');
  const name  = input.value.trim();
  if (!name) return;
  const color = document.querySelector('#tagPopoverColors .tag-color-dot.selected')?.dataset.color || TAG_COLORS[0];
  proj.tags = proj.tags || [];
  proj.tags.push({ id: uid(), name, color });
  save();
  input.value = '';
  // re-open
  openTagPopover({ target: document.body }, _tagPopoverPhaseId, _tagPopoverTaskId);
}

function buildColorDots(container, selectedColor) {
  container.innerHTML = '';
  TAG_COLORS.forEach((c, i) => {
    const dot = document.createElement('span');
    dot.className = 'tag-color-dot' + ((!selectedColor && i === 0) || selectedColor === c ? ' selected' : '');
    dot.dataset.color = c;
    dot.style.background = c;
    dot.addEventListener('click', () => {
      container.querySelectorAll('.tag-color-dot').forEach(d => d.classList.remove('selected'));
      dot.classList.add('selected');
    });
    container.appendChild(dot);
  });
}

/* ============================================================
   EXPORT
   ============================================================ */

async function exportAsImage() {
  const overlay = document.getElementById('exportOverlay');
  overlay.style.display = 'flex';
  initIcons();

  try {
    const el = document.getElementById('projectView');
    const canvas = await html2canvas(el, {
      backgroundColor: '#0D0D14',
      scale: 2,
      useCORS: true,
      logging: false
    });

    const link = document.createElement('a');
    const proj = activeProject();
    link.download = `roadmap-${(proj?.name || 'projeto').toLowerCase().replace(/\s+/g, '-')}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  } catch (err) {
    console.error('Export failed', err);
    alert('Não foi possível exportar a imagem. Tente novamente.');
  } finally {
    overlay.style.display = 'none';
  }
}

/* ============================================================
   STATIC EVENT BINDINGS
   ============================================================ */

function bindStaticEvents() {
  // Add project
  document.getElementById('btnAddProject').addEventListener('click', openAddProject);
  document.getElementById('btnAddProjectEmpty').addEventListener('click', openAddProject);

  // Phase
  document.getElementById('btnAddPhase').addEventListener('click', openAddPhase);

  // Edit / Delete project
  document.getElementById('btnEditProject').addEventListener('click', openEditProject);
  document.getElementById('btnDeleteProject').addEventListener('click', confirmDeleteProject);

  // Export
  document.getElementById('btnExport').addEventListener('click', exportAsImage);

  // Modal Project
  document.getElementById('btnSaveProject').addEventListener('click', saveProject);
  document.getElementById('btnCancelProject').addEventListener('click', closeModalProject);
  document.getElementById('btnCloseModalProject').addEventListener('click', closeModalProject);

  // Modal Phase
  document.getElementById('btnSavePhase').addEventListener('click', savePhase);
  document.getElementById('btnCancelPhase').addEventListener('click', closeModalPhase);
  document.getElementById('btnCloseModalPhase').addEventListener('click', closeModalPhase);

  // Modal Confirm
  document.getElementById('btnCancelConfirm').addEventListener('click', closeModalConfirm);
  document.getElementById('btnCloseConfirm').addEventListener('click', closeModalConfirm);

  // Emoji picker
  document.getElementById('emojiPicker').addEventListener('click', (e) => {
    const opt = e.target.closest('.emoji-option');
    if (!opt) return;
    document.querySelectorAll('.emoji-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });

  // Color picker
  document.getElementById('colorPicker').addEventListener('click', (e) => {
    const opt = e.target.closest('.color-option');
    if (!opt) return;
    document.querySelectorAll('.color-option').forEach(o => o.classList.remove('selected'));
    opt.classList.add('selected');
  });

  // Add tag in project modal
  document.getElementById('btnAddTagModal').addEventListener('click', addTagInModal);
  document.getElementById('inputNewTagModal').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addTagInModal();
  });

  // Tag popover create inline
  document.getElementById('btnCreateTagInline').addEventListener('click', createTagInPopover);
  document.getElementById('tagPopoverInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') createTagInPopover();
  });

  // Close modals on overlay
  document.getElementById('modalProject').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModalProject();
  });
  document.getElementById('modalPhase').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModalPhase();
  });
  document.getElementById('modalConfirm').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) closeModalConfirm();
  });

  // Close tag popover on outside click
  document.addEventListener('click', (e) => {
    if (!_tagPopoverOpen) return;
    const pop = document.getElementById('tagPopover');
    if (!pop.contains(e.target) && !e.target.closest('[data-action="open-tags"]')) {
      closeTagPopover();
    }
  });

  // Enter keys for modals
  document.getElementById('inputProjectName').addEventListener('keydown', e => { if (e.key === 'Enter') saveProject(); });
  document.getElementById('inputPhaseName').addEventListener('keydown',   e => { if (e.key === 'Enter') savePhase(); });
}

/* ============================================================
   MODAL: PROJECT
   ============================================================ */

let _editingProjectId = null;
// temp tags while editing
let _tempTags = [];

function openAddProject() {
  _editingProjectId = null;
  _tempTags = [];
  document.getElementById('modalProjectTitle').textContent = 'Novo Projeto';
  document.getElementById('inputProjectName').value = '';
  document.getElementById('inputProjectDesc').value = '';
  setSelectedEmoji('📐');
  setSelectedColor('#6C63FF');
  buildColorDots(document.getElementById('tagModalColors'));
  renderTagsCurrentList();
  document.getElementById('modalProject').style.display = 'flex';
  setTimeout(() => document.getElementById('inputProjectName').focus(), 80);
  initIcons();
}

function openEditProject() {
  const proj = activeProject();
  if (!proj) return;
  _editingProjectId = proj.id;
  _tempTags = JSON.parse(JSON.stringify(proj.tags || []));
  document.getElementById('modalProjectTitle').textContent = 'Editar Projeto';
  document.getElementById('inputProjectName').value = proj.name;
  document.getElementById('inputProjectDesc').value = proj.desc || '';
  setSelectedEmoji(proj.emoji);
  setSelectedColor(proj.color);
  buildColorDots(document.getElementById('tagModalColors'));
  renderTagsCurrentList();
  document.getElementById('modalProject').style.display = 'flex';
  setTimeout(() => document.getElementById('inputProjectName').focus(), 80);
  initIcons();
}

function closeModalProject() {
  document.getElementById('modalProject').style.display = 'none';
  _editingProjectId = null;
  _tempTags = [];
}

function saveProject() {
  const name = document.getElementById('inputProjectName').value.trim();
  if (!name) { document.getElementById('inputProjectName').focus(); return; }

  const desc  = document.getElementById('inputProjectDesc').value.trim();
  const emoji = document.querySelector('.emoji-option.selected')?.dataset.emoji || '📐';
  const color = document.querySelector('.color-option.selected')?.dataset.color || '#6C63FF';

  if (_editingProjectId) {
    const proj = state.projects.find(p => p.id === _editingProjectId);
    if (proj) {
      proj.name = name; proj.desc = desc;
      proj.emoji = emoji; proj.color = color;
      proj.tags = _tempTags;
    }
  } else {
    const newProj = { id: uid(), name, desc, emoji, color, tags: _tempTags, phases: [] };
    state.projects.push(newProj);
    state.activeProjectId = newProj.id;
  }

  save();
  closeModalProject();
  render();
}

/* Tags in Project Modal */

function addTagInModal() {
  const input = document.getElementById('inputNewTagModal');
  const name  = input.value.trim();
  if (!name) return;
  const color = document.querySelector('#tagModalColors .tag-color-dot.selected')?.dataset.color || TAG_COLORS[0];
  _tempTags.push({ id: uid(), name, color });
  input.value = '';
  renderTagsCurrentList();
}

function renderTagsCurrentList() {
  const container = document.getElementById('tagsCurrentList');
  container.innerHTML = '';
  _tempTags.forEach(tag => {
    const pill = document.createElement('div');
    pill.className = 'tag-manager-pill';
    pill.style.color = tag.color;
    pill.style.borderColor = hexToRgba(tag.color, 0.4);
    pill.style.background  = hexToRgba(tag.color, 0.12);
    pill.innerHTML = `${escHtml(tag.name)} <span class="tag-remove" data-tagid="${tag.id}">×</span>`;
    pill.querySelector('.tag-remove').addEventListener('click', () => {
      _tempTags = _tempTags.filter(t => t.id !== tag.id);
      renderTagsCurrentList();
    });
    container.appendChild(pill);
  });
}

/* ============================================================
   MODAL: PHASE
   ============================================================ */

let _editingPhaseId = null;

function openAddPhase() {
  const proj = activeProject();
  if (!proj) return;
  _editingPhaseId = null;
  document.getElementById('modalPhaseTitle').textContent = 'Nova Fase';
  document.getElementById('inputPhaseName').value = `Fase ${proj.phases.length + 1}`;
  document.getElementById('inputPhaseDesc').value = '';
  document.getElementById('inputPhaseStart').value = '';
  document.getElementById('inputPhaseEnd').value = '';
  document.getElementById('modalPhase').style.display = 'flex';
  setTimeout(() => { const i = document.getElementById('inputPhaseName'); i.focus(); i.select(); }, 80);
  initIcons();
}

function openEditPhase(phaseId) {
  const proj = activeProject();
  const ph   = proj?.phases.find(p => p.id === phaseId);
  if (!ph) return;
  _editingPhaseId = phaseId;
  document.getElementById('modalPhaseTitle').textContent = 'Editar Fase';
  document.getElementById('inputPhaseName').value  = ph.name;
  document.getElementById('inputPhaseDesc').value  = ph.desc || '';
  document.getElementById('inputPhaseStart').value = ph.startDate || '';
  document.getElementById('inputPhaseEnd').value   = ph.endDate   || '';
  document.getElementById('modalPhase').style.display = 'flex';
  setTimeout(() => { const i = document.getElementById('inputPhaseName'); i.focus(); i.select(); }, 80);
  initIcons();
}

function closeModalPhase() {
  document.getElementById('modalPhase').style.display = 'none';
  _editingPhaseId = null;
}

function savePhase() {
  const name = document.getElementById('inputPhaseName').value.trim();
  if (!name) { document.getElementById('inputPhaseName').focus(); return; }

  const desc      = document.getElementById('inputPhaseDesc').value.trim();
  const startDate = document.getElementById('inputPhaseStart').value;
  const endDate   = document.getElementById('inputPhaseEnd').value;
  const proj      = activeProject();
  if (!proj) return;

  if (_editingPhaseId) {
    const ph = proj.phases.find(p => p.id === _editingPhaseId);
    if (ph) { ph.name = name; ph.desc = desc; ph.startDate = startDate; ph.endDate = endDate; }
  } else {
    proj.phases.push({ id: uid(), name, desc, startDate, endDate, notes: '', collapsed: false, tasks: [] });
  }

  save();
  closeModalPhase();
  render();
}

/* ============================================================
   MODAL: CONFIRM
   ============================================================ */

let _confirmCallback = null;

function showConfirm(title, message, callback) {
  document.getElementById('confirmTitle').textContent   = title;
  document.getElementById('confirmMessage').textContent = message;
  _confirmCallback = callback;
  document.getElementById('modalConfirm').style.display = 'flex';
  initIcons();
  document.getElementById('btnConfirmAction').onclick = () => {
    if (_confirmCallback) _confirmCallback();
    closeModalConfirm();
  };
}

function closeModalConfirm() {
  document.getElementById('modalConfirm').style.display = 'none';
  _confirmCallback = null;
}

function confirmDeleteProject() {
  const proj = activeProject();
  if (!proj) return;
  showConfirm(
    'Excluir projeto',
    `Tem certeza que deseja excluir "${proj.name}"? Todas as fases e tarefas serão perdidas.`,
    () => deleteProject(proj.id)
  );
}

function confirmDeletePhase(phaseId) {
  const proj = activeProject();
  const ph   = proj?.phases.find(p => p.id === phaseId);
  if (!ph) return;
  showConfirm(
    'Excluir fase',
    `Tem certeza que deseja excluir "${ph.name}"? Todas as tarefas da fase serão perdidas.`,
    () => deletePhase(phaseId)
  );
}

/* ============================================================
   HELPERS
   ============================================================ */

function setSelectedEmoji(emoji) {
  document.querySelectorAll('.emoji-option').forEach(o =>
    o.classList.toggle('selected', o.dataset.emoji === emoji)
  );
}

function setSelectedColor(color) {
  document.querySelectorAll('.color-option').forEach(o =>
    o.classList.toggle('selected', o.dataset.color === color)
  );
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function shortText(str, max) {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function pctColor(pct) {
  if (pct === 100) return 'var(--success)';
  if (pct >=  50)  return 'var(--accent)';
  return 'var(--text-secondary)';
}

function hexToRgba(hex, alpha) {
  if (!hex || hex.length < 7) return `rgba(108,99,255,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function formatDate(str) {
  if (!str) return '';
  const [y, m, d] = str.split('-');
  return `${d}/${m}/${y}`;
}
