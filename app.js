/* Global Todo App — plain JavaScript, data saved in localStorage. */
(function () {
  'use strict';

  const { LANGUAGES, STRINGS, SAMPLE_TASKS } = window.GT_I18N;
  const STORAGE_KEY = 'globalTodo.tasks';
  const THEME_KEY = 'globalTodo.theme';
  const LANG_KEY = 'globalTodo.lang';
  const PRIORITIES = ['low', 'medium', 'high'];
  const PRIORITY_RANK = { high: 0, medium: 1, low: 2 };
  const CATEGORIES = ['work', 'home', 'personal', 'others']; // a category is required
  const TITLE_MIN = 3;
  const TITLE_MIN_CHINESE = 2; // Chinese words are short
  const TITLE_MAX = 120;

  const $ = (id) => document.getElementById(id);
  const root = document.documentElement;

  // ---------- Storage helpers (never throw) ----------
  function readStore(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStore(key, value) {
    try { localStorage.setItem(key, value); return true; } catch (e) { return false; }
  }

  // ---------- Language ----------
  let lang = pickInitialLanguage();

  function pickInitialLanguage() {
    const saved = readStore(LANG_KEY);
    if (saved && STRINGS[saved]) return saved;
    const prefs = navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || 'en'];
    for (const p of prefs) {
      const code = String(p).toLowerCase().slice(0, 2);
      if (STRINGS[code]) return code;
    }
    return 'en';
  }

  const langInfo = () => LANGUAGES.find((l) => l.code === lang) || LANGUAGES[0];

  function t(key, vars) {
    let s = (STRINGS[lang] && STRINGS[lang][key]) || STRINGS.en[key] || key;
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  const num = (n) => new Intl.NumberFormat(langInfo().locale).format(n);
  const pct = (n) => new Intl.NumberFormat(langInfo().locale, { style: 'percent' }).format(n / 100);

  // ---------- State ----------
  let tasks = loadTasks();
  const view = { filter: 'all', search: '', category: '', sort: 'manual', editingId: null };

  // ---------- Elements ----------
  const list = $('taskList');
  const addForm = $('addForm');
  const titleInput = $('titleInput');
  const notesInput = $('notesInput');
  const priorityInput = $('priorityInput');
  const dueInput = $('dueInput');
  const categoryInput = $('categoryInput');

  // ---------- Helpers ----------
  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  // Local date as YYYY-MM-DD, optionally shifted by a number of days.
  function dateStr(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + (offsetDays || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const todayStr = () => dateStr(0);

  function formatDue(str) {
    const [y, m, d] = str.split('-').map(Number);
    const sameYear = y === new Date().getFullYear();
    return new Date(y, m - 1, d).toLocaleDateString(langInfo().locale, {
      month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric',
    });
  }

  const isOverdue = (task) => !task.completed && task.due && task.due < todayStr();

  function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k === 'dataset') Object.assign(node.dataset, v);
        else if (k in node && k !== 'list') node[k] = v;
        else node.setAttribute(k, v === true ? '' : v);
      }
    }
    (children || []).forEach((c) => c && node.appendChild(c));
    return node;
  }

  // An <svg> that uses one of the icons from the sprite in index.html.
  function icon(name) {
    const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('class', 'icon');
    s.setAttribute('aria-hidden', 'true');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#i-' + name);
    s.appendChild(use);
    return s;
  }

  // Maps stored category text to one of the fixed categories. Older free-text
  // categories match by name in any language (e.g. "Work", "Travail"); empty or unknown text becomes "Others".
  function normalizeCategory(value) {
    const v = typeof value === 'string' ? value.trim().toLocaleLowerCase() : '';
    if (!v) return 'others';
    if (CATEGORIES.includes(v)) return v;
    if (v === 'other') return 'others';
    for (const key of CATEGORIES) {
      for (const code in STRINGS) {
        if ((STRINGS[code]['c_' + key] || '').toLocaleLowerCase() === v) return key;
      }
    }
    return 'others';
  }

  const categoryName = (key) => (key ? t('c_' + key) : '');

  // Makes sure a task object (from storage or an imported file) has valid fields.
  function sanitizeTask(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = typeof raw.title === 'string' ? raw.title.trim().slice(0, 200) : '';
    if (!title) return null;
    return {
      id: typeof raw.id === 'string' && raw.id ? raw.id : uid(),
      title,
      notes: typeof raw.notes === 'string' ? raw.notes.slice(0, 2000) : '',
      priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'medium',
      due: typeof raw.due === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.due) ? raw.due : '',
      category: normalizeCategory(raw.category),
      completed: Boolean(raw.completed),
      createdAt: Number(raw.createdAt) || Date.now(),
      sample: raw.sample === true, // marks tasks added by "Load sample data"
    };
  }

  // ---------- Tasks storage ----------
  function loadTasks() {
    const raw = readStore(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(sanitizeTask).filter(Boolean) : [];
    } catch (e) {
      console.error('Could not load tasks', e);
      setTimeout(() => showToast(t('err_load'), { type: 'error' }), 0);
      return [];
    }
  }

  function save() {
    if (!writeStore(STORAGE_KEY, JSON.stringify(tasks))) showToast(t('err_save'), { type: 'error' });
  }

  function commit() {
    save();
    render();
  }

  // ---------- Toast (success / error / info, optional Undo) ----------
  let toastTimer = null;
  let undoAction = null;
  const TOAST_ICONS = { success: 'check-circle', error: 'alert', info: 'info' };

  function showToast(message, opts) {
    const { type = 'success', undo = null } = opts || {};
    const toast = $('toast');
    toast.className = 'toast ' + type;
    $('toastIcon').setAttribute('href', '#i-' + TOAST_ICONS[type]);
    $('toastMsg').setAttribute('aria-live', type === 'error' ? 'assertive' : 'polite');
    $('toastMsg').textContent = message;
    undoAction = undo;
    $('toastUndo').hidden = !undo;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, undo ? 6000 : type === 'error' ? 7000 : 3500);
  }

  function hideToast() {
    $('toast').hidden = true;
    undoAction = null;
  }

  $('toastUndo').addEventListener('click', () => {
    const fn = undoAction;
    hideToast();
    if (fn) fn();
  });
  $('toastClose').addEventListener('click', hideToast);

  // Keeps a copy of the tasks so the change can be undone from the toast.
  function withUndo(message, change) {
    const snapshot = tasks.map((x) => ({ ...x }));
    change();
    commit();
    showToast(message, {
      undo: () => {
        tasks = snapshot;
        commit();
        showToast(t('ok_restored'), { type: 'info' });
      },
    });
  }

  // ---------- Confirmation dialog ----------
  function confirmAction(title, text, okLabel) {
    const dlg = $('confirmDialog');
    if (!dlg.showModal) return Promise.resolve(window.confirm(title + '\n\n' + text));
    $('confirmTitle').textContent = title;
    $('confirmText').textContent = text;
    $('confirmOk').textContent = okLabel;
    dlg.returnValue = '';
    dlg.showModal();
    $('confirmOk').focus();
    return new Promise((resolve) => {
      dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
    });
  }

  // ---------- Filtering & sorting ----------
  function getVisible() {
    const q = view.search.trim().toLocaleLowerCase();
    const out = tasks.filter((x) => {
      if (view.filter === 'pending' && x.completed) return false;
      if (view.filter === 'completed' && !x.completed) return false;
      if (view.category && x.category !== view.category) return false;
      return !q || (x.title + ' ' + x.notes + ' ' + categoryName(x.category)).toLocaleLowerCase().includes(q);
    });

    const byDue = (a, b) => (a.due || '9999-99-99').localeCompare(b.due || '9999-99-99');
    const byPriority = (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    switch (view.sort) {
      case 'due': out.sort((a, b) => byDue(a, b) || byPriority(a, b)); break;
      case 'priority': out.sort((a, b) => byPriority(a, b) || byDue(a, b)); break;
      case 'newest': out.sort((a, b) => b.createdAt - a.createdAt); break;
      case 'oldest': out.sort((a, b) => a.createdAt - b.createdAt); break;
      case 'alpha': out.sort((a, b) => a.title.localeCompare(b.title, langInfo().locale, { sensitivity: 'base' })); break;
      default: break; // "My order" = the order of the tasks array
    }
    return out;
  }

  const hasFilters = () => Boolean(view.search.trim() || view.category);

  // ---------- Rendering ----------
  function render() {
    const visible = getVisible();
    const canReorder = view.sort === 'manual';

    closeTaskMenu();
    list.replaceChildren(...visible.map((x) => renderTask(x, canReorder)));
    renderEmptyState(visible.length);
    $('sortHint').hidden = canReorder || visible.length < 2;
    $('sampleBanner').hidden = !tasks.some((x) => x.sample);
    renderStats();
  }

  function renderEmptyState(count) {
    const empty = $('emptyState');
    empty.hidden = count > 0;
    if (count) return;
    let key = 'empty';
    if (tasks.length) {
      if (hasFilters()) key = 'nomatch';
      else if (view.filter === 'pending') key = 'alldone';
      else if (view.filter === 'completed') key = 'nodone';
      else key = 'nomatch';
    }
    $('emptyMsg').textContent = t(key + '_msg');
    $('clearFiltersBtn').hidden = key !== 'nomatch';
    $('emptySampleBtn').hidden = key !== 'empty';
  }

  function renderTask(task, canReorder) {
    const li = el('li', {
      class: 'task priority-' + task.priority + (task.completed ? ' completed' : ''),
      dataset: { id: task.id },
    });

    if (view.editingId === task.id) {
      li.classList.add('editing');
      li.appendChild(renderEditForm(task));
      return li;
    }

    const handle = el('span', { class: 'drag-handle', title: t('drag'), 'aria-hidden': 'true' }, [icon('grip')]);
    handle.hidden = !canReorder;

    const checkbox = el('input', {
      type: 'checkbox', class: 'checkbox', checked: task.completed,
      'aria-label': (task.completed ? t('mark_pending') : t('mark_done')) + ': ' + task.title,
      dataset: { action: 'toggle' },
    });

    const meta = el('div', { class: 'meta' });
    meta.appendChild(el('span', { class: 'tag p-' + task.priority }, [icon('flag'), el('span', { text: t('p_' + task.priority) })]));
    if (task.due) {
      let cls = 'tag';
      let label = t('due_on', { date: formatDue(task.due) });
      if (isOverdue(task)) { cls += ' overdue'; label = t('due_overdue', { date: formatDue(task.due) }); }
      else if (!task.completed && task.due === todayStr()) { cls += ' today'; label = t('due_today'); }
      meta.appendChild(el('span', { class: cls }, [icon('calendar'), el('span', { text: label })]));
    }
    meta.appendChild(el('span', { class: 'tag category' }, [icon('tag'), el('span', { text: categoryName(task.category) })]));

    const more = el('button', {
      type: 'button', class: 'more-btn', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'taskMenu',
      'aria-label': t('more_actions') + ': ' + task.title, title: t('more_actions'), dataset: { action: 'more' },
    }, [icon('dots')]);

    li.append(
      handle,
      el('label', { class: 'check' }, [checkbox]),
      el('div', { class: 'task-body' }, [
        el('p', { class: 'task-title', text: task.title }),
        task.notes ? el('p', { class: 'task-notes', text: task.notes }) : null,
        meta,
      ]),
      more
    );
    return li;
  }

  function renderEditForm(task) {
    const id = task.id;
    // A labelled field; validated fields get an error line underneath (linked via aria-describedby).
    const field = (labelKey, control, validated) => {
      const children = [el('label', { htmlFor: control.id, text: t(labelKey) }), control];
      if (validated) {
        control.setAttribute('aria-describedby', 'err-' + control.id);
        children.push(el('p', { class: 'field-error', id: 'err-' + control.id, hidden: true }, [icon('alert'), el('span')]));
      }
      return el('div', { class: 'field' }, children);
    };
    const titleEl = el('input', { type: 'text', id: 'et-' + id, name: 'title', value: task.title, maxLength: TITLE_MAX, required: true, autocomplete: 'off' });
    const prioritySel = el('select', { id: 'ep-' + id, name: 'priority', required: true }, [
      el('option', { value: '', text: t('ph_priority'), disabled: true, selected: !PRIORITIES.includes(task.priority) }),
      ...PRIORITIES.map((p) => el('option', { value: p, text: t('p_' + p), selected: task.priority === p })),
    ]);
    const dueEl = el('input', { type: 'date', id: 'ed-' + id, name: 'due', value: task.due, min: todayStr(), required: true });
    const categorySel = el('select', { id: 'ec-' + id, name: 'category', required: true }, [
      el('option', { value: '', text: t('ph_category'), disabled: true, selected: !CATEGORIES.includes(task.category) }),
      ...CATEGORIES.map((c) => el('option', { value: c, text: t('c_' + c), selected: task.category === c })),
    ]);

    return el('form', { class: 'edit-form', novalidate: true }, [
      el('h3', { class: 'card-title', text: t('edit_task') }),
      field('f_title', titleEl, true),
      field('f_notes', el('textarea', { id: 'en-' + id, name: 'notes', rows: 3, value: task.notes, maxLength: 2000, placeholder: t('ph_notes') })),
      el('div', { class: 'field-row' }, [
        field('f_priority', prioritySel, true),
        field('f_due', dueEl, true),
        field('f_category', categorySel, true),
      ]),
      el('div', { class: 'edit-actions' }, [
        el('button', { type: 'button', class: 'btn btn-secondary', text: t('cancel'), dataset: { action: 'cancel-edit' } }),
        el('button', { type: 'submit', class: 'btn btn-primary', text: t('save') }),
      ]),
    ]);
  }

  function renderStats() {
    const total = tasks.length;
    const done = tasks.filter((x) => x.completed).length;
    const pending = total - done;
    const overdue = tasks.filter(isOverdue).length;
    const percent = total ? Math.round((done / total) * 100) : 0;

    $('statTotal').textContent = num(total);
    $('statPending').textContent = num(pending);
    $('statDone').textContent = num(done);
    $('statOverdue').textContent = num(overdue);
    $('countAll').textContent = num(total);
    $('countPending').textContent = num(pending);
    $('countDone').textContent = num(done);

    $('progressBar').style.width = percent + '%';
    $('progress').setAttribute('aria-valuenow', percent);
    $('progressLabel').textContent = !total ? t('progress_empty')
      : percent === 100 ? t('progress_all')
      : t('progress', { pct: pct(percent) });
  }

  function renderCategoryFilter() {
    $('categoryFilter').replaceChildren(
      el('option', { value: '', text: t('all_cats'), selected: !view.category }),
      ...CATEGORIES.map((c) => el('option', { value: c, text: t('c_' + c), selected: view.category === c }))
    );
  }

  // ---------- Validation (shared by Add task and Edit task) ----------
  function validateTitle(value) {
    const title = value.trim();
    if (!title) return t('err_empty');
    const length = [...title].length; // counts characters, not UTF-16 units
    const min = /\p{Script=Han}/u.test(title) ? TITLE_MIN_CHINESE : TITLE_MIN;
    if (length < min) return t('err_title_short', { min: num(min) });
    if (length > TITLE_MAX) return t('err_title_long', { max: num(TITLE_MAX) });
    if (!/[\p{L}\p{N}]/u.test(title)) return t('err_title_letters'); // any language's letters or digits
    return '';
  }

  function isRealDate(str) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
    const [y, m, d] = str.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }

  const VALIDATORS = {
    title: validateTitle,
    priority: (v) => (PRIORITIES.includes(v) ? '' : t('err_priority')),
    due: (v) => (!isRealDate(v) ? t('err_due_required') : v < todayStr() ? t('err_due_past') : ''),
    category: (v) => (CATEGORIES.includes(v) ? '' : t('err_category')),
  };

  // Shows (or clears) the red message under a field and outlines the field.
  function setFieldError(input, message) {
    const errorEl = document.getElementById(input.getAttribute('aria-describedby'));
    if (errorEl) {
      errorEl.querySelector('span').textContent = message;
      errorEl.hidden = !message;
    }
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  // Checks every field; focuses the first one with a problem. Returns true when all are valid.
  function validateForm(form) {
    let firstInvalid = null;
    for (const name in VALIDATORS) {
      const input = form.elements[name];
      const message = VALIDATORS[name](input.value);
      setFieldError(input, message);
      if (message && !firstInvalid) firstInvalid = input;
    }
    if (firstInvalid) firstInvalid.focus();
    return !firstInvalid;
  }

  // Once a field shows an error, re-check it as the user types so the error clears as soon as it's fixed.
  function revalidateField(e) {
    const input = e.target;
    if (!input.form || input.getAttribute('aria-invalid') !== 'true' || !VALIDATORS[input.name]) return;
    setFieldError(input, VALIDATORS[input.name](input.value));
  }
  document.addEventListener('input', revalidateField);
  document.addEventListener('change', revalidateField);

  // Keep the date pickers' minimum at today (also correct after midnight).
  document.addEventListener('focusin', (e) => {
    if (e.target.type === 'date' && e.target.form) e.target.min = todayStr();
  });

  // ---------- Static text translation ----------
  function applyLanguage() {
    const info = langInfo();
    root.lang = info.locale;
    root.dir = info.dir;

    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = t(n.dataset.i18n); });
    document.querySelectorAll('[data-i18n-ph]').forEach((n) => { n.placeholder = t(n.dataset.i18nPh); });
    document.querySelectorAll('[data-i18n-aria]').forEach((n) => { n.setAttribute('aria-label', t(n.dataset.i18nAria)); });
    document.querySelectorAll('[data-i18n-tip]').forEach((n) => { n.dataset.tip = t(n.dataset.i18nTip); });
    document.querySelectorAll('[data-i18n-title]').forEach((n) => { n.title = t(n.dataset.i18nTitle); });

    $('langFlag').innerHTML = info.flag;
    $('langName').textContent = info.name;
    $('langBtn').setAttribute('aria-label', t('lang_label') + ': ' + info.name);
    $('today').textContent = new Date().toLocaleDateString(info.locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    renderLangList();
    renderCategoryFilter();
    syncThemeButton();
    dueInput.min = todayStr();
    // Re-show any visible Add-task errors in the new language.
    addForm.querySelectorAll('[aria-invalid="true"]').forEach((n) => setFieldError(n, VALIDATORS[n.name](n.value)));
    render();
  }

  // ---------- Language picker ----------
  const langBtn = $('langBtn');
  const langList = $('langList');

  function renderLangList() {
    langList.setAttribute('aria-label', t('lang_label'));
    langList.replaceChildren(...LANGUAGES.map((l) => {
      const li = el('li', { role: 'option', tabIndex: -1, 'aria-selected': String(l.code === lang), dataset: { lang: l.code }, lang: l.locale });
      li.insertAdjacentHTML('beforeend', l.flag);
      li.appendChild(el('span', { class: 'lang-native', text: l.name }));
      if (l.name !== l.english) li.appendChild(el('span', { class: 'lang-en', text: l.english, lang: 'en' }));
      return li;
    }));
  }

  function openLangMenu() {
    closeToolsMenu();
    langList.hidden = false;
    langBtn.setAttribute('aria-expanded', 'true');
    (langList.querySelector('[aria-selected="true"]') || langList.firstElementChild).focus();
  }

  function closeLangMenu(focusButton) {
    if (langList.hidden) return;
    langList.hidden = true;
    langBtn.setAttribute('aria-expanded', 'false');
    if (focusButton) langBtn.focus();
  }

  function setLanguage(code) {
    if (!STRINGS[code]) return;
    lang = code;
    writeStore(LANG_KEY, code);
    applyLanguage();
  }

  langBtn.addEventListener('click', () => (langList.hidden ? openLangMenu() : closeLangMenu()));
  langBtn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); openLangMenu(); }
  });
  langList.addEventListener('click', (e) => {
    const li = e.target.closest('[data-lang]');
    if (!li) return;
    closeLangMenu(true);
    setLanguage(li.dataset.lang);
  });
  langList.addEventListener('keydown', (e) => {
    const items = [...langList.children];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); items[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); items[items.length - 1].focus(); }
    else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (i > -1) { closeLangMenu(true); setLanguage(items[i].dataset.lang); }
    } else if (e.key === 'Escape') { closeLangMenu(true); }
    else if (e.key === 'Tab') { closeLangMenu(); }
  });

  // ---------- Settings menu (mobile) ----------
  const settingsBtn = $('settingsBtn');
  const toolsMenu = $('toolsMenu');

  function closeToolsMenu(focusButton) {
    if (!toolsMenu.classList.contains('open')) return;
    toolsMenu.classList.remove('open');
    settingsBtn.setAttribute('aria-expanded', 'false');
    if (focusButton) settingsBtn.focus();
  }

  settingsBtn.addEventListener('click', () => {
    const open = !toolsMenu.classList.contains('open');
    closeLangMenu();
    toolsMenu.classList.toggle('open', open);
    settingsBtn.setAttribute('aria-expanded', String(open));
    if (open) toolsMenu.querySelector('button').focus();
  });
  toolsMenu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeToolsMenu(true);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#lang')) closeLangMenu();
    if (!e.target.closest('#toolsMenu') && !e.target.closest('#settingsBtn')) closeToolsMenu();
  });

  // ---------- Adding ----------
  addForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!validateForm(addForm)) return;

    tasks.unshift({
      id: uid(),
      title: titleInput.value.trim(),
      notes: notesInput.value.trim(),
      priority: priorityInput.value,
      due: dueInput.value,
      category: categoryInput.value,
      completed: false,
      createdAt: Date.now(),
    });
    commit();

    addForm.reset(); // back to "Select priority", empty date and "No category"
    titleInput.focus();
    showToast(t('ok_added'));
  });

  // ---------- Task actions (event delegation) ----------
  const findTask = (id) => tasks.find((x) => x.id === id);

  list.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action]');
    if (!target) return;
    const li = target.closest('.task');
    const id = li && li.dataset.id;
    const task = findTask(id);
    if (!task) return;

    switch (target.dataset.action) {
      case 'toggle':
        task.completed = !task.completed;
        commit();
        if (task.completed) showToast(t('ok_done'));
        focusInTask(id, '.checkbox');
        break;
      case 'more':
        openTaskMenu(target, false);
        break;
      case 'cancel-edit':
        view.editingId = null;
        render();
        focusInTask(id, '.more-btn');
        break;
    }
  });

  list.addEventListener('keydown', (e) => {
    const btn = e.target.closest('.more-btn');
    if (btn && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault();
      openTaskMenu(btn, e.key === 'ArrowUp');
    }
  });

  function focusInTask(id, selector) {
    const n = list.querySelector('.task[data-id="' + CSS.escape(id) + '"] ' + selector);
    if (n && !n.disabled) n.focus();
  }

  // ---------- Task "⋯" menu: Edit, Move up, Move down, Delete ----------
  const taskMenu = $('taskMenu');
  let menuFor = null; // { id, button } while the menu is open
  const menuItem = (cmd) => taskMenu.querySelector('[data-cmd="' + cmd + '"]');
  const enabledMenuItems = () => [...taskMenu.querySelectorAll('[role="menuitem"]:not(:disabled)')];

  function openTaskMenu(button, focusLast) {
    const id = button.closest('.task').dataset.id;
    const reopen = !menuFor || menuFor.id !== id;
    closeTaskMenu(!reopen);
    if (!reopen) return; // second click on the same button closes it
    closeLangMenu();
    closeToolsMenu();

    const visible = getVisible();
    const i = visible.findIndex((x) => x.id === id);
    const canReorder = view.sort === 'manual';
    menuItem('up').disabled = !canReorder || i <= 0;
    menuItem('down').disabled = !canReorder || i === visible.length - 1;

    menuFor = { id, button };
    button.setAttribute('aria-expanded', 'true');
    taskMenu.hidden = false;
    positionTaskMenu(button);
    const items = enabledMenuItems();
    items[focusLast ? items.length - 1 : 0].focus({ preventScroll: true });
  }

  // Places the menu under the button, or above it when there isn't room below.
  // It lines up with the button's outer edge: the right edge normally, the left edge in right-to-left languages.
  function positionTaskMenu(button) {
    const pad = 8;
    const gap = 6;
    const r = button.getBoundingClientRect();
    const w = taskMenu.offsetWidth;
    const h = taskMenu.offsetHeight;
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;

    let top = r.bottom + gap;
    let placement = 'down';
    if (top + h > vh - pad) {
      if (r.top - gap - h >= pad) { top = r.top - gap - h; placement = 'up'; }
      else top = Math.max(pad, vh - pad - h);
    }
    let left = root.dir === 'rtl' ? r.left : r.right - w;
    left = Math.min(Math.max(pad, left), vw - pad - w);

    taskMenu.style.top = Math.round(top) + 'px';
    taskMenu.style.left = Math.round(left) + 'px';
    taskMenu.dataset.placement = placement;
  }

  function closeTaskMenu(focusButton) {
    if (!menuFor) return;
    const { button } = menuFor;
    menuFor = null;
    taskMenu.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (focusButton && button.isConnected) button.focus();
  }

  taskMenu.addEventListener('click', (e) => {
    const item = e.target.closest('[data-cmd]');
    if (!item || item.disabled || !menuFor) return;
    const { id } = menuFor;
    closeTaskMenu();
    runTaskCommand(item.dataset.cmd, id);
  });

  taskMenu.addEventListener('keydown', (e) => {
    const items = enabledMenuItems();
    const i = items.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); items[(n + items.length) % items.length].focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(items.length - 1);
    else if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); closeTaskMenu(true); }
  });

  document.addEventListener('pointerdown', (e) => {
    if (menuFor && !e.target.closest('#taskMenu') && !e.target.closest('.more-btn')) closeTaskMenu();
  });
  // The menu is fixed to the screen: keep it attached to its button while the page scrolls or resizes,
  // and close it once the button has scrolled out of view.
  let menuFrame = 0;
  function followButton() {
    if (!menuFor || menuFrame) return;
    menuFrame = requestAnimationFrame(() => {
      menuFrame = 0;
      if (!menuFor) return;
      const r = menuFor.button.getBoundingClientRect();
      if (!menuFor.button.isConnected || r.bottom < 0 || r.top > window.innerHeight) closeTaskMenu();
      else positionTaskMenu(menuFor.button);
    });
  }
  window.addEventListener('resize', followButton);
  window.addEventListener('scroll', followButton, true);

  function runTaskCommand(cmd, id) {
    switch (cmd) {
      case 'edit':
        view.editingId = id;
        render();
        focusInTask(id, 'input[name="title"]');
        break;
      case 'up':
      case 'down':
        moveTask(id, cmd === 'up' ? -1 : 1);
        break;
      case 'delete': {
        // Keep keyboard focus nearby: the next task's ⋯ button, else the previous one, else the task field.
        const li = list.querySelector('.task[data-id="' + CSS.escape(id) + '"]');
        const neighbour = li && (li.nextElementSibling || li.previousElementSibling);
        const neighbourId = neighbour && neighbour.dataset.id;
        if (view.editingId === id) view.editingId = null;
        withUndo(t('ok_deleted'), () => { tasks = tasks.filter((x) => x.id !== id); });
        if (neighbourId) focusInTask(neighbourId, '.more-btn');
        else titleInput.focus();
        break;
      }
    }
  }

  list.addEventListener('submit', (e) => {
    e.preventDefault();
    const form = e.target;
    const id = form.closest('.task').dataset.id;
    const task = findTask(id);
    if (!task || !validateForm(form)) return;

    task.title = form.elements.title.value.trim();
    task.notes = form.elements.notes.value.trim();
    task.priority = form.elements.priority.value;
    task.due = form.elements.due.value;
    task.category = form.elements.category.value;
    view.editingId = null;
    commit();
    focusInTask(id, '.more-btn');
    showToast(t('ok_saved'));
  });

  list.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view.editingId) {
      const id = view.editingId;
      view.editingId = null;
      render();
      focusInTask(id, '.more-btn');
    }
  });

  // Moves a task one place up/down among the visible tasks.
  function moveTask(id, dir) {
    const visible = getVisible();
    const i = visible.findIndex((x) => x.id === id);
    const other = visible[i + dir];
    if (!other) return;
    const a = tasks.indexOf(visible[i]);
    const b = tasks.indexOf(other);
    [tasks[a], tasks[b]] = [tasks[b], tasks[a]];
    commit();
    focusInTask(id, '.more-btn');
  }

  // Applies a new order for the visible tasks, leaving hidden (filtered-out) tasks in their slots.
  function applyVisibleOrder(newIds) {
    const idSet = new Set(newIds);
    const slots = [];
    tasks.forEach((x, i) => { if (idSet.has(x.id)) slots.push(i); });
    const byId = new Map(tasks.map((x) => [x.id, x]));
    const next = tasks.slice();
    newIds.forEach((id, k) => { next[slots[k]] = byId.get(id); });
    tasks = next;
  }

  // ---------- Drag to reorder (mouse + touch via Pointer Events) ----------
  let drag = null;
  const domIds = () => [...list.children].map((li) => li.dataset.id);

  list.addEventListener('pointerdown', (e) => {
    const handle = e.target.closest('.drag-handle');
    if (!handle || view.sort !== 'manual' || e.button > 0) return;
    e.preventDefault();
    const item = handle.closest('.task');
    drag = { item, before: domIds().join() };
    item.classList.add('dragging');
    document.body.style.userSelect = 'none';
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', onDragEnd);
    window.addEventListener('pointercancel', onDragEnd);
  });

  function onDragMove(e) {
    if (!drag) return;
    e.preventDefault();
    const y = e.clientY;

    // Auto-scroll near the top/bottom edge (helpful on phones).
    const edge = 70;
    if (y < edge) window.scrollBy(0, -12);
    else if (y > window.innerHeight - edge) window.scrollBy(0, 12);

    const others = [...list.querySelectorAll('.task:not(.dragging)')];
    const next = others.find((s) => {
      const r = s.getBoundingClientRect();
      return y < r.top + r.height / 2;
    });
    if (next) {
      if (drag.item.nextElementSibling !== next) list.insertBefore(drag.item, next);
    } else if (list.lastElementChild !== drag.item) {
      list.appendChild(drag.item);
    }
  }

  function onDragEnd() {
    if (!drag) return;
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', onDragEnd);
    window.removeEventListener('pointercancel', onDragEnd);
    document.body.style.userSelect = '';
    drag.item.classList.remove('dragging');
    const ids = domIds();
    const changed = ids.join() !== drag.before;
    drag = null;
    if (changed) {
      applyVisibleOrder(ids);
      commit();
    }
  }

  // ---------- Toolbar ----------
  function setFilter(filter) {
    view.filter = filter;
    document.querySelectorAll('[data-filter]').forEach((b) => {
      const on = b.dataset.filter === filter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
    render();
  }

  document.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
  $('searchInput').addEventListener('input', (e) => { view.search = e.target.value; render(); });
  $('categoryFilter').addEventListener('change', (e) => { view.category = e.target.value; render(); });
  $('sortSelect').addEventListener('change', (e) => { view.sort = e.target.value; render(); });

  // ---------- Sample data ----------
  // One entry per sample task, in the order of SAMPLE_TASKS in i18n.js.
  // due: days from today (null = no due date). The overdue task is exempt from the no-past-dates rule.
  const SAMPLE_PLAN = [
    { priority: 'high', category: 'work', due: 1 },                       // slides (tomorrow)
    { priority: 'high', category: 'work', due: -2 },                      // client reply (overdue)
    { priority: 'medium', category: 'personal', due: 7 },                 // dentist (next week)
    { priority: 'medium', category: 'home', due: 0 },                     // groceries (today)
    { priority: 'high', category: 'home', due: 1, completed: true },      // electricity bill
    { priority: 'low', category: 'personal', due: null },                 // run
    { priority: 'medium', category: 'others', due: 7 },                   // passport (next week)
    { priority: 'low', category: 'home', due: null, completed: true },    // plants
    { priority: 'low', category: 'others', due: null },                   // weekend trip
    { priority: 'medium', category: 'work', due: 0, completed: true },    // monthly report
  ];

  // Adds the sample tasks in the current language after the user's own tasks.
  // Loading again replaces the previous sample set instead of duplicating it; the user's tasks are never touched.
  function loadSampleData() {
    const texts = SAMPLE_TASKS[lang] || SAMPLE_TASKS.en;
    const now = Date.now();
    const samples = SAMPLE_PLAN.map((plan, i) => ({
      id: uid(),
      title: texts[i][0],
      notes: texts[i][1],
      priority: plan.priority,
      due: plan.due === null ? '' : dateStr(plan.due),
      category: plan.category,
      completed: Boolean(plan.completed),
      createdAt: now - (SAMPLE_PLAN.length - i) * 60000,
      sample: true,
    }));
    tasks = tasks.filter((x) => !x.sample).concat(samples);
    save();
    // Reset search and filters so every sample task is visible.
    view.editingId = null;
    view.search = '';
    view.category = '';
    $('searchInput').value = '';
    renderCategoryFilter();
    setFilter('all');
    showToast(t('ok_sample_loaded', { n: num(samples.length) }));
  }

  // Removes only the sample tasks (with Undo); the user's own tasks stay.
  function clearSampleData() {
    if (tasks.some((x) => x.sample && x.id === view.editingId)) view.editingId = null;
    withUndo(t('ok_sample_cleared'), () => { tasks = tasks.filter((x) => !x.sample); });
    (list.querySelector('.more-btn') || titleInput).focus();
  }

  $('sampleBtn').addEventListener('click', () => { closeToolsMenu(); loadSampleData(); });
  $('emptySampleBtn').addEventListener('click', loadSampleData);
  $('clearSampleBtn').addEventListener('click', clearSampleData);

  $('clearFiltersBtn').addEventListener('click', () => {
    view.search = '';
    view.category = '';
    $('searchInput').value = '';
    setFilter('all');
  });


  // ---------- Dark mode ----------
  const themeBtn = $('themeToggle');
  const isDark = () => root.getAttribute('data-theme') === 'dark';

  function syncThemeButton() {
    const dark = isDark();
    const label = dark ? t('light') : t('dark');
    const tip = dark ? t('light_tip') : t('dark_tip');
    $('themeIcon').setAttribute('href', dark ? '#i-sun' : '#i-moon');
    $('themeLabel').textContent = label;
    $('themeDesc').textContent = tip;
    themeBtn.dataset.tip = tip;
    themeBtn.setAttribute('aria-pressed', String(dark));
    document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0B2E2B' : '#0F766E');
  }

  themeBtn.addEventListener('click', () => {
    const dark = !isDark();
    if (dark) root.setAttribute('data-theme', 'dark');
    else root.removeAttribute('data-theme');
    writeStore(THEME_KEY, dark ? 'dark' : 'light');
    syncThemeButton();
    closeToolsMenu();
  });

  // ---------- Export / import ----------
  $('exportBtn').addEventListener('click', () => {
    closeToolsMenu();
    const data = { app: 'Global Todo App', version: 1, exportedAt: new Date().toISOString(), tasks };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: 'global-todo-backup-' + todayStr() + '.json' });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t('ok_exported', { n: num(tasks.length) }));
  });

  $('importBtn').addEventListener('click', () => {
    closeToolsMenu();
    $('importInput').click();
  });

  $('importInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    e.target.value = ''; // allow choosing the same file again later
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async () => {
      let imported;
      try {
        const parsed = JSON.parse(reader.result);
        const arr = Array.isArray(parsed) ? parsed : parsed && parsed.tasks;
        if (!Array.isArray(arr)) throw new Error('No tasks array');
        imported = arr.map(sanitizeTask).filter(Boolean);
      } catch (err) {
        showToast(t('err_invalid'), { type: 'error' });
        return;
      }
      if (!imported.length) return showToast(t('err_nothing'), { type: 'error' });

      // Avoid duplicate IDs inside the imported file.
      const seen = new Set();
      imported.forEach((x) => { if (seen.has(x.id)) x.id = uid(); seen.add(x.id); });

      if (tasks.length) {
        const ok = await confirmAction(t('confirm_title'),
          t('confirm_text', { cur: num(tasks.length), n: num(imported.length) }), t('confirm_ok'));
        if (!ok) return;
      }
      view.editingId = null;
      withUndo(t('ok_imported', { n: num(imported.length) }), () => { tasks = imported; });
    };
    reader.onerror = () => showToast(t('err_read'), { type: 'error' });
    reader.readAsText(file);
  });

  // ---------- Keep other open tabs in sync ----------
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) { tasks = loadTasks(); render(); }
  });

  // ---------- Start ----------
  applyLanguage();
})();
