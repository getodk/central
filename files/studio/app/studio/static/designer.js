// The questionnaire designer: a tree of sections, repeats and questions on the
// left, a properties panel on the right, and choice lists shared across both.

import { api, saveResponse } from './api.js';
import { parse as parseExpression } from './expr.js';
import { openPreview } from './preview.js';
import { checkbox, clear, confirmDialog, el, field, groupedSelect, input, modal, select, textarea, toast } from './ui.js';

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Appearances worth suggesting per type; XLSForm accepts many more.
const APPEARANCES = {
  text: ['multiline', 'numbers', 'url'],
  integer: ['numbers', 'thousands-sep'],
  decimal: ['numbers', 'thousands-sep', 'bearing'],
  select_one: ['minimal', 'quick', 'horizontal', 'columns-2', 'columns-3', 'likert', 'autocomplete', 'map', 'quickcompact'],
  select_multiple: ['minimal', 'horizontal', 'columns-2', 'columns-3', 'autocomplete', 'map'],
  date: ['month-year', 'year', 'no-calendar'],
  geopoint: ['maps', 'placement-map'],
  image: ['signature', 'annotate', 'draw', 'new-front'],
  note: ['multiline'],
  group: ['field-list', 'table-list', 'w1', 'w2'],
};

export function createDesigner(ctx, record, onExit) {
  const state = {
    record,
    doc: normalise(record.document),
    selectedId: null,
    language: null,
    dirty: false,
    issues: [],
  };
  state.language = state.doc.defaultLanguage || state.doc.languages[0];

  const root = el('div');
  const treeHost = el('div', { class: 'tree' });
  const propsHost = el('div', { class: 'props' });
  const issuesHost = el('div');
  const statusHost = el('span', { class: 'muted small' });

  // -- document helpers ---------------------------------------------------

  function normalise(document) {
    const copy = JSON.parse(JSON.stringify(document));
    copy.languages = copy.languages?.length ? copy.languages : ['English (en)'];
    copy.defaultLanguage = copy.languages.includes(copy.defaultLanguage)
      ? copy.defaultLanguage : copy.languages[0];
    copy.choiceLists = copy.choiceLists || [];
    copy.items = copy.items || [];
    const stamp = (items) => items.forEach((item) => {
      withDefaults(item);
      stamp(item.children);
    });
    stamp(copy.items);
    return copy;
  }

  // Everything an item needs to be renderable. Applied both to questionnaires
  // read back from the server and to items added here, so a newly added
  // question is never missing a field the properties panel reads.
  function withDefaults(item) {
    if (!item.id) item.id = uid();
    item.children = item.children || [];
    item.rules = item.rules || [];
    item.label = item.label || {};
    item.hint = item.hint || {};
    item.requiredMessage = item.requiredMessage || {};
    // Questionnaires saved before multi-rule validation carry a single
    // constraint; fold it in as the server does on save.
    if (item.constraint && item.constraint.trim()) {
      item.rules.unshift({
        expression: item.constraint,
        message: item.constraintMessage || {},
        severity: 'error',
      });
    }
    item.constraint = '';
    item.constraintMessage = {};
    return item;
  }

  function walk(items = state.doc.items, parent = null, out = []) {
    for (const item of items) {
      out.push({ item, parent });
      if (item.kind === 'group') walk(item.children, item, out);
    }
    return out;
  }

  const find = (id) => walk().find((entry) => entry.item.id === id) || null;
  const siblingsOf = (parent) => (parent ? parent.children : state.doc.items);

  function allNames() {
    return new Set(walk().map(({ item }) => (item.name || '').toLowerCase()));
  }

  function uniqueName(base) {
    const taken = allNames();
    let candidate = base;
    let counter = 1;
    while (taken.has(candidate.toLowerCase())) { counter += 1; candidate = `${base}_${counter}`; }
    return candidate;
  }

  function markDirty() {
    state.dirty = true;
    statusHost.textContent = 'Unsaved changes';
  }

  function refresh({ tree = true, props = true } = {}) {
    if (tree) renderTree();
    if (props) renderProps();
    scheduleValidate();
  }

  // -- mutations ----------------------------------------------------------

  function addItem(kind, questionType) {
    const selected = state.selectedId ? find(state.selectedId) : null;
    let parent = null;
    let index;

    if (selected && selected.item.kind === 'group') {
      // Adding while a section is selected puts the new item inside it.
      parent = selected.item;
      index = parent.children.length;
    } else if (selected) {
      parent = selected.parent;
      index = siblingsOf(parent).indexOf(selected.item) + 1;
    } else {
      index = state.doc.items.length;
    }

    const base = kind === 'group' ? (questionType === 'repeat' ? 'repeat' : 'section') : (questionType || 'question');
    const item = kind === 'group'
      ? { id: uid(), kind: 'group', name: uniqueName(base), label: {}, children: [], repeat: questionType === 'repeat', repeatCount: '', relevant: '', appearance: '' }
      : { id: uid(), kind: 'question', type: questionType || 'text', name: uniqueName(base), label: {}, hint: {}, required: false, relevant: '', constraint: '', constraintMessage: {}, requiredMessage: {}, calculation: '', default: '', appearance: '', readOnly: false, choiceList: '', choiceFilter: '', parameters: '', children: [] };

    siblingsOf(parent).splice(index, 0, withDefaults(item));
    state.selectedId = item.id;
    markDirty();
    refresh();
  }

  function removeSelected() {
    const entry = state.selectedId ? find(state.selectedId) : null;
    if (!entry) return;
    const list = siblingsOf(entry.parent);
    const index = list.indexOf(entry.item);
    list.splice(index, 1);
    state.selectedId = (list[index] || list[index - 1] || entry.parent)?.id || null;
    markDirty();
    refresh();
  }

  function duplicateSelected() {
    const entry = state.selectedId ? find(state.selectedId) : null;
    if (!entry) return;
    const copy = JSON.parse(JSON.stringify(entry.item));
    const rename = (node) => {
      node.id = uid();
      node.name = uniqueName(node.name || 'item');
      (node.children || []).forEach(rename);
    };
    rename(copy);
    const applyDefaults = (node) => { withDefaults(node); node.children.forEach(applyDefaults); };
    applyDefaults(copy);
    const list = siblingsOf(entry.parent);
    list.splice(list.indexOf(entry.item) + 1, 0, copy);
    state.selectedId = copy.id;
    markDirty();
    refresh();
  }

  function move(direction) {
    const entry = state.selectedId ? find(state.selectedId) : null;
    if (!entry) return;
    const list = siblingsOf(entry.parent);
    const index = list.indexOf(entry.item);
    const target = index + direction;
    if (target < 0 || target >= list.length) return;
    list.splice(index, 1);
    list.splice(target, 0, entry.item);
    markDirty();
    refresh({ props: false });
  }

  function outdent() {
    const entry = state.selectedId ? find(state.selectedId) : null;
    if (!entry || !entry.parent) return;
    const grandparent = find(entry.parent.id)?.parent || null;
    const siblings = siblingsOf(entry.parent);
    siblings.splice(siblings.indexOf(entry.item), 1);
    const target = siblingsOf(grandparent);
    target.splice(target.indexOf(entry.parent) + 1, 0, entry.item);
    markDirty();
    refresh();
  }

  function indent() {
    const entry = state.selectedId ? find(state.selectedId) : null;
    if (!entry) return;
    const list = siblingsOf(entry.parent);
    const index = list.indexOf(entry.item);
    // Only a preceding section can take the item in.
    const host = list[index - 1];
    if (!host || host.kind !== 'group') return;
    list.splice(index, 1);
    host.children.push(entry.item);
    markDirty();
    refresh();
  }

  function isAncestor(ancestorId, itemId) {
    const entry = find(itemId);
    let cursor = entry?.parent || null;
    while (cursor) {
      if (cursor.id === ancestorId) return true;
      cursor = find(cursor.id)?.parent || null;
    }
    return false;
  }

  function relocate(dragId, targetId, zone) {
    if (dragId === targetId || isAncestor(dragId, targetId)) return;
    const dragged = find(dragId);
    const target = find(targetId);
    if (!dragged || !target) return;

    const from = siblingsOf(dragged.parent);
    from.splice(from.indexOf(dragged.item), 1);

    if (zone === 'inside' && target.item.kind === 'group') {
      target.item.children.push(dragged.item);
    } else {
      const list = siblingsOf(target.parent);
      const at = list.indexOf(target.item) + (zone === 'after' ? 1 : 0);
      list.splice(at, 0, dragged.item);
    }
    state.selectedId = dragId;
    markDirty();
    refresh();
  }

  // -- tree ---------------------------------------------------------------

  function labelFor(item) {
    return (item.label || {})[state.language]
      || Object.values(item.label || {}).find((v) => v && v.trim())
      || '';
  }

  function renderTree() {
    clear(treeHost);
    if (!state.doc.items.length) {
      treeHost.appendChild(el('div', { class: 'empty' }, [
        el('p', { text: 'This questionnaire is empty.' }),
        el('p', { class: 'small', text: 'Add a section or a question to begin.' }),
      ]));
      return;
    }
    treeHost.appendChild(buildLevel(state.doc.items));
  }

  function buildLevel(items) {
    const host = el('div');
    for (const item of items) {
      host.appendChild(buildRow(item));
      if (item.kind === 'group') {
        host.appendChild(el('div', { class: 'tree-children' }, [buildLevel(item.children)]));
      }
    }
    return host;
  }

  function buildRow(item) {
    const isGroup = item.kind === 'group';
    const classes = ['tree-row'];
    if (isGroup) classes.push(item.repeat ? 'is-repeat' : 'is-group');
    if (item.id === state.selectedId) classes.push('selected');

    const text = labelFor(item);
    const row = el('div', {
      class: classes.join(' '),
      draggable: 'true',
      onclick: () => { state.selectedId = item.id; refresh(); },
    }, [
      el('span', { class: 'kind', text: isGroup ? (item.repeat ? 'repeat' : 'section') : shortType(item.type) }),
      el('span', { class: 'name', text: item.name || '—' }),
      el('span', { class: `text${text ? '' : ' untitled'}`, text: text || 'No label' }),
      item.required ? el('span', { class: 'flag', text: '*', title: 'Required' }) : null,
    ]);

    row.addEventListener('dragstart', (event) => {
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', (event) => {
      event.preventDefault();
      row.classList.remove('drop-before', 'drop-after', 'drop-inside');
      row.classList.add(`drop-${zoneFor(event, row, isGroup)}`);
    });
    row.addEventListener('dragleave', () => {
      row.classList.remove('drop-before', 'drop-after', 'drop-inside');
    });
    row.addEventListener('drop', (event) => {
      event.preventDefault();
      const zone = zoneFor(event, row, isGroup);
      row.classList.remove('drop-before', 'drop-after', 'drop-inside');
      relocate(event.dataTransfer.getData('text/plain'), item.id, zone);
    });
    return row;
  }

  function zoneFor(event, row, isGroup) {
    const box = row.getBoundingClientRect();
    const offset = (event.clientY - box.top) / box.height;
    if (isGroup && offset > 0.3 && offset < 0.7) return 'inside';
    return offset < 0.5 ? 'before' : 'after';
  }

  function shortType(type) {
    return ({
      select_one: 'select1', select_multiple: 'select*', calculate: 'calc',
      dateTime: 'datetime', geopoint: 'gps', geotrace: 'gps line', geoshape: 'gps area',
    })[type] || type;
  }

  // -- properties ---------------------------------------------------------

  function localizedInput(item, key, labelText, hint, multiline = false) {
    const value = (item[key] || {})[state.language] || '';
    const onInput = (next) => {
      item[key] = item[key] || {};
      if (next) item[key][state.language] = next;
      else delete item[key][state.language];
      markDirty();
      if (key === 'label') renderTree();
    };
    const control = multiline
      ? textarea(value, onInput, { rows: 3, class: 'prose' })
      : input(value, onInput);
    const languageNote = state.doc.languages.length > 1 ? `${state.language}` : '';
    return field(labelText, control, [hint, languageNote].filter(Boolean).join(' · '));
  }

  function appearanceControl(item) {
    const list = APPEARANCES[item.kind === 'group' ? 'group' : item.type] || [];
    const listId = `app-${item.id}`;
    const control = input(item.appearance, (v) => { item.appearance = v; markDirty(); }, { list: listId });
    const datalist = el('datalist', { id: listId }, list.map((v) => el('option', { value: v })));
    return el('div', {}, [field('Appearance', control, 'controls how the question is displayed'), datalist]);
  }

  function renderProps() {
    clear(propsHost);
    const entry = state.selectedId ? find(state.selectedId) : null;
    if (!entry) {
      propsHost.appendChild(el('div', { class: 'empty', text: 'Select an item to edit its properties.' }));
      return;
    }
    const item = entry.item;
    const sections = [];

    const basics = [
      field('Variable name', input(item.name, (v) => { item.name = v.trim(); markDirty(); renderTree(); scheduleValidate(); }, { class: 'mono' }),
        'used as the column name in exported data'),
      localizedInput(item, 'label', item.kind === 'group' ? 'Section title' : 'Question text', '', true),
    ];

    if (item.kind === 'question') {
      basics.splice(0, 0, field('Type', groupedSelect(
        ctx.questionTypes.map((t) => ({ value: t.value, label: t.label, group: t.group })),
        item.type,
        (v) => { item.type = v; markDirty(); refresh(); },
      )));
      basics.push(localizedInput(item, 'hint', 'Hint', 'guidance shown under the question'));
    }

    sections.push(el('div', { class: 'section' }, [el('h3', { text: 'Basics' }), ...basics]));

    if (item.kind === 'group') {
      sections.push(el('div', { class: 'section' }, [
        el('h3', { text: 'Section behaviour' }),
        checkbox('Repeat this section (roster)', item.repeat, (v) => { item.repeat = v; markDirty(); refresh(); }),
        item.repeat ? field('Repeat count',
          input(item.repeatCount, (v) => { item.repeatCount = v; markDirty(); }, { class: 'mono' }),
          'an expression such as ${hhsize}; leave blank to let the interviewer add rows') : null,
        field('Relevance', input(item.relevant, (v) => { item.relevant = v; markDirty(); }, { class: 'mono' }),
          'ask this whole section only when true, e.g. ${age} > 17'),
        appearanceControl(item),
      ]));
    }

    if (item.kind === 'question' && ctx.typeSpec(item.type).choices) {
      const names = state.doc.choiceLists.map((l) => ({ value: l.name, label: `${l.name} (${l.options.length})` }));
      sections.push(el('div', { class: 'section' }, [
        el('h3', { text: 'Choices' }),
        field('Choice list', select(
          [{ value: '', label: '— select a list —' }, ...names],
          item.choiceList,
          (v) => { item.choiceList = v; markDirty(); scheduleValidate(); },
        )),
        el('div', { class: 'row' }, [
          el('button', { class: 'mini', text: 'Manage choice lists', onclick: openChoiceLists }),
          el('button', {
            class: 'mini',
            text: 'New list from this question',
            onclick: () => openChoiceLists(newListFor(item)),
          }),
        ]),
        field('Choice filter', input(item.choiceFilter, (v) => { item.choiceFilter = v; markDirty(); }, { class: 'mono' }),
          'for cascading selects, e.g. region=${region}'),
      ]));
    }

    if (item.kind === 'question') {
      const isDisplayOnly = ['note', 'calculate', 'hidden'].includes(item.type);
      sections.push(el('div', { class: 'section' }, [
        el('h3', { text: 'Logic' }),
        !isDisplayOnly ? checkbox('Required', item.required, (v) => { item.required = v; markDirty(); renderTree(); }) : null,
        !isDisplayOnly && item.required ? localizedInput(item, 'requiredMessage', 'Message when missing') : null,
        field('Relevance', input(item.relevant, (v) => { item.relevant = v; markDirty(); }, { class: 'mono' }),
          'show only when true, e.g. ${age} > 17'),
        field('Calculation', input(item.calculation, (v) => { item.calculation = v; markDirty(); scheduleValidate(); }, { class: 'mono' }),
          item.type === 'calculate' ? 'required for this type' : 'optional derived value'),
        field('Default value', input(item.default, (v) => { item.default = v; markDirty(); })),
        item.type === 'range' ? field('Parameters', input(item.parameters, (v) => { item.parameters = v; markDirty(); }, { class: 'mono' }),
          'e.g. start=0 end=100 step=5') : null,
        checkbox('Read only', item.readOnly, (v) => { item.readOnly = v; markDirty(); }),
        appearanceControl(item),
      ]));
    }

    if (item.kind === 'question' && !['note', 'hidden'].includes(item.type)) {
      sections.push(rulesSection(item));
    }

    sections.push(el('div', { class: 'section' }, [
      el('div', { class: 'row' }, [
        el('button', { class: 'mini', text: '↑ Up', onclick: () => move(-1) }),
        el('button', { class: 'mini', text: '↓ Down', onclick: () => move(1) }),
        el('button', { class: 'mini', text: '→ Indent', onclick: indent }),
        el('button', { class: 'mini', text: '← Outdent', onclick: outdent }),
      ]),
      el('div', { class: 'row', style: 'margin-top:10px' }, [
        el('button', { class: 'mini', text: 'Duplicate', onclick: duplicateSelected }),
        el('button', { class: 'mini danger', text: 'Delete', onclick: async () => {
          const label = labelFor(item) || item.name;
          const hasChildren = item.kind === 'group' && item.children.length;
          const ok = await confirmDialog('Delete item',
            hasChildren
              ? `Delete "${label}" and the ${item.children.length} item(s) it contains?`
              : `Delete "${label}"?`);
          if (ok) removeSelected();
        } }),
      ]),
    ]));

    sections.forEach((section) => propsHost.appendChild(section));
  }

  function newListFor(item) {
    const name = uniqueListName((item.name || 'list') + '_list');
    state.doc.choiceLists.push({ name, options: [{ value: '1', label: { [state.language]: '' } }] });
    item.choiceList = name;
    markDirty();
    return name;
  }

  function uniqueListName(base) {
    const taken = new Set(state.doc.choiceLists.map((l) => l.name));
    let candidate = base;
    let counter = 1;
    while (taken.has(candidate)) { counter += 1; candidate = `${base}_${counter}`; }
    return candidate;
  }

  // -- validation rules ---------------------------------------------------

  function rulesSection(item) {
    const host = el('div', { class: 'section' });

    function draw() {
      clear(host);
      host.appendChild(el('div', { style: 'display:flex; align-items:center; gap:10px' }, [
        el('h3', { text: 'Validation', style: 'margin:0' }),
        el('div', { style: 'flex:1' }),
        el('button', { class: 'mini', text: '+ Add rule', onclick: () => {
          item.rules.push({ expression: '', message: {}, severity: 'error' });
          markDirty(); draw(); scheduleValidate();
        } }),
      ]));

      if (!withDefaults(item).rules.length) {
        host.appendChild(el('p', { class: 'small muted', style: 'margin-top:10px', text:
          'No checks yet. An error stops the interviewer; a warning is shown but can be ignored.' }));
        return;
      }

      item.rules.forEach((rule, index) => {
        host.appendChild(ruleCard(item, rule, index, draw));
      });
    }

    draw();
    return host;
  }

  function ruleCard(item, rule, index, redraw) {
    const card = el('div', { class: `rule-card ${rule.severity}` });

    const problem = el('div', { class: 'rule-problem' });
    const checkExpression = (value) => {
      clear(problem);
      if (!value.trim()) return;
      try {
        parseExpression(value);
      } catch (error) {
        // Still valid for Collect; only the in-designer preview is limited.
        problem.appendChild(el('span', {
          text: `Preview cannot evaluate this (${error.message}). It is still sent to Central.`,
        }));
      }
    };

    card.appendChild(el('div', { class: 'rule-head' }, [
      select(
        [{ value: 'error', label: 'Error — blocks' }, { value: 'warning', label: 'Warning — advisory' }],
        rule.severity,
        (v) => { rule.severity = v; markDirty(); redraw(); scheduleValidate(); },
        { style: 'width:auto' },
      ),
      el('div', { style: 'flex:1' }),
      el('button', { class: 'mini ghost', text: '✕', title: 'Remove this rule', onclick: () => {
        item.rules.splice(index, 1); markDirty(); redraw(); scheduleValidate();
      } }),
    ]));

    const expression = input(rule.expression, (v) => {
      rule.expression = v; markDirty(); checkExpression(v); scheduleValidate();
    }, { class: 'mono', placeholder: '. >= 0 and . <= 120' });
    card.appendChild(field('Condition that must be true', expression));
    card.appendChild(problem);
    checkExpression(rule.expression);

    const language = state.language;
    const message = input(rule.message?.[language] || '', (v) => {
      rule.message = rule.message || {};
      if (v) rule.message[language] = v; else delete rule.message[language];
      markDirty(); scheduleValidate();
    }, { placeholder: 'Shown when the condition fails' });
    card.appendChild(field(
      `Message${state.doc.languages.length > 1 ? ` (${language})` : ''}`, message,
    ));

    return card;
  }

  // -- choice lists -------------------------------------------------------

  function openChoiceLists(focusName) {
    let current = focusName || state.doc.choiceLists[0]?.name || null;
    const body = el('div');

    function draw() {
      clear(body);
      const picker = el('div', { style: 'display:flex; gap:10px; margin-bottom:14px; align-items:center; flex-wrap:wrap' }, [
        select(
          state.doc.choiceLists.map((l) => ({ value: l.name, label: `${l.name} (${l.options.length})` })),
          current,
          (v) => { current = v; draw(); },
          { style: 'max-width:280px' },
        ),
        el('button', { class: 'mini', text: 'New list', onclick: () => {
          const name = uniqueListName('list');
          state.doc.choiceLists.push({ name, options: [] });
          current = name; markDirty(); draw();
        } }),
        el('button', { class: 'mini danger', text: 'Delete list', onclick: async () => {
          if (!current) return;
          const inUse = walk().filter(({ item }) => item.choiceList === current);
          const ok = await confirmDialog('Delete choice list',
            inUse.length
              ? `"${current}" is used by ${inUse.length} question(s). Delete it anyway?`
              : `Delete choice list "${current}"?`);
          if (!ok) return;
          state.doc.choiceLists = state.doc.choiceLists.filter((l) => l.name !== current);
          current = state.doc.choiceLists[0]?.name || null;
          markDirty(); draw(); refresh();
        } }),
      ]);
      body.appendChild(picker);

      const list = state.doc.choiceLists.find((l) => l.name === current);
      if (!list) {
        body.appendChild(el('div', { class: 'empty', text: 'No choice lists yet. Create one to get started.' }));
        return;
      }

      body.appendChild(field('List name', input(list.name, (v) => {
        const old = list.name;
        const next = v.trim();
        list.name = next;
        // Keep every question that referenced this list pointing at it.
        walk().forEach(({ item }) => { if (item.choiceList === old) item.choiceList = next; });
        current = next;
        markDirty();
      }, { class: 'mono' })));

      const table = el('table', { class: 'grid' }, [
        el('thead', {}, [el('tr', {}, [
          el('th', { text: 'Value', style: 'width:26%' }),
          el('th', { text: `Label${state.doc.languages.length > 1 ? ` (${state.language})` : ''}` }),
          el('th', { text: '', style: 'width:60px' }),
        ])]),
      ]);
      const tbody = el('tbody');
      list.options.forEach((option, index) => {
        tbody.appendChild(el('tr', {}, [
          el('td', {}, [input(option.value, (v) => { option.value = v.trim(); markDirty(); }, { class: 'mono' })]),
          el('td', {}, [input(option.label?.[state.language] || '', (v) => {
            option.label = option.label || {};
            if (v) option.label[state.language] = v; else delete option.label[state.language];
            markDirty();
          })]),
          el('td', {}, [el('button', { class: 'mini danger', text: '✕', onclick: () => {
            list.options.splice(index, 1); markDirty(); draw();
          } })]),
        ]));
      });
      table.appendChild(tbody);
      body.appendChild(table);

      body.appendChild(el('div', { style: 'margin-top:12px; display:flex; gap:10px' }, [
        el('button', { class: 'mini', text: '+ Add option', onclick: () => {
          list.options.push({ value: String(list.options.length + 1), label: {} });
          markDirty(); draw();
        } }),
        el('button', { class: 'mini', text: 'Paste options in bulk', onclick: () => bulkPaste(list, draw) }),
      ]));
    }

    draw();
    modal({
      title: 'Choice lists',
      body,
      wide: true,
      onClose: () => refresh(),
      actions: (close) => [el('button', { class: 'primary', text: 'Done', onclick: close })],
    });
  }

  function bulkPaste(list, redraw) {
    const area = textarea('', () => {}, { rows: 12, placeholder: '1, Male\n2, Female\n\nOne option per line: value, label' });
    modal({
      title: `Paste options into "${list.name}"`,
      body: el('div', {}, [
        el('p', { class: 'small muted', text: 'One option per line as "value, label". A line with no comma becomes both the value and the label.' }),
        area,
      ]),
      actions: (close) => [
        el('button', { text: 'Cancel', onclick: close }),
        el('button', { class: 'primary', text: 'Replace options', onclick: () => {
          list.options = area.value.split('\n')
            .map((line) => line.trim()).filter(Boolean)
            .map((line) => {
              const at = line.indexOf(',');
              const value = at === -1 ? line : line.slice(0, at).trim();
              const label = at === -1 ? line : line.slice(at + 1).trim();
              return { value, label: { [state.language]: label } };
            });
          markDirty(); close(); redraw();
        } }),
      ],
    });
  }

  // -- validation ---------------------------------------------------------

  let validateTimer = null;
  function scheduleValidate() {
    clearTimeout(validateTimer);
    validateTimer = setTimeout(runValidate, 400);
  }

  async function runValidate() {
    try {
      const result = await api.validate(state.doc);
      state.issues = result.issues;
      renderIssues(result);
    } catch (error) {
      // Validation is advisory; a hiccup here should not block editing.
      state.issues = [];
      clear(issuesHost);
    }
  }

  function renderIssues(result) {
    clear(issuesHost);
    const head = el('div', { class: 'panel-head' }, [
      el('h2', { text: 'Checks' }),
      el('div', { class: 'spacer' }),
      el('span', { class: `pill ${result.errors ? 'err' : (result.warnings ? 'warn' : 'ok')}`,
        text: result.errors ? `${result.errors} error${result.errors > 1 ? 's' : ''}`
          : (result.warnings ? `${result.warnings} warning${result.warnings > 1 ? 's' : ''}` : 'All good') }),
    ]);
    issuesHost.appendChild(head);
    if (!result.issues.length) {
      issuesHost.appendChild(el('div', { class: 'empty small', text: 'No problems found. This questionnaire is ready to publish.' }));
      return;
    }
    const list = el('div', { class: 'issues' });
    for (const issue of result.issues) {
      list.appendChild(el('div', { class: 'issue' }, [
        el('span', { class: `pill ${issue.level === 'error' ? 'err' : 'warn'}`, text: issue.level }),
        el('span', { class: 'where', text: issue.where, title: issue.where }),
        el('span', { text: issue.message }),
      ]));
    }
    issuesHost.appendChild(list);
  }

  // -- persistence & publishing -------------------------------------------

  async function save() {
    try {
      const updated = await api.saveQuestionnaire(state.record.id, state.doc);
      state.record = updated;
      state.dirty = false;
      statusHost.textContent = `Saved ${new Date().toLocaleTimeString()}`;
      toast('Questionnaire saved', 'ok');
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  async function downloadXlsform() {
    try {
      const response = await api.downloadXlsform(state.doc);
      await saveResponse(response, `${state.doc.formId || 'form'}.xlsx`);
    } catch (error) {
      toast(error.message, 'error');
    }
  }

  function openPublish() {
    let mode = state.record.publishedAs ? 'draft' : 'new';
    let bump = true;
    const body = el('div');

    const draw = () => {
      clear(body);
      body.appendChild(el('p', { class: 'small muted', text:
        'Studio uploads the questionnaire to Central as an XLSForm. Central converts it and leaves it as a draft, so you can test it in Central before publishing it to data collectors.' }));
      body.appendChild(field('Publish as', select([
        { value: 'new', label: 'A new form in this project' },
        { value: 'draft', label: 'A new draft of the existing form with this id' },
      ], mode, (v) => { mode = v; })));
      body.appendChild(checkbox('Set a new version number automatically', bump, (v) => { bump = v; }));
      if (state.record.publishedAs) {
        body.appendChild(el('p', { class: 'small muted', text: `Last published to Central as "${state.record.publishedAs}".` }));
      }
    };
    draw();

    modal({
      title: 'Publish to Central',
      body,
      actions: (close) => [
        el('button', { text: 'Cancel', onclick: close }),
        el('button', { class: 'primary', text: 'Publish', onclick: async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          button.textContent = 'Publishing…';
          try {
            const result = await api.publish(state.record.id, state.doc, mode, bump);
            state.doc.version = result.version;
            state.dirty = false;
            try {
              state.record = await api.questionnaire(state.record.id);
            } catch (_) {
              // The publish itself succeeded; a stale record is not worth failing over.
            }
            close();
            toast(`Uploaded to Central as a draft of "${result.xmlFormId}". Open Central to test and publish it.`, 'ok');
            renderBar();
          } catch (error) {
            button.disabled = false;
            button.textContent = 'Publish';
            toast(error.message, 'error');
          }
        } }),
      ],
    });
  }

  async function openVersions() {
    let versions;
    try {
      versions = await api.versions(state.record.id);
    } catch (error) {
      toast(error.message, 'error');
      return;
    }
    const table = el('table', { class: 'grid' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'When' }), el('th', { text: 'By' }),
        el('th', { text: 'Note' }), el('th', { text: '' }),
      ])]),
    ]);
    const tbody = el('tbody');
    for (const version of versions) {
      tbody.appendChild(el('tr', {}, [
        el('td', { text: new Date(version.createdAt).toLocaleString() }),
        el('td', { text: version.createdBy || '—' }),
        el('td', { text: version.note || '' }),
        el('td', {}, [el('button', { class: 'mini', text: 'Restore', onclick: async (event) => {
          const ok = await confirmDialog('Restore version',
            'Restore this version? The current content is kept in the history.', 'Restore');
          if (!ok) return;
          try {
            const restored = await api.restoreVersion(state.record.id, version.id);
            state.record = restored;
            state.doc = normalise(restored.document);
            state.language = state.doc.defaultLanguage;
            state.selectedId = null;
            state.dirty = false;
            event.currentTarget.closest('.modal-backdrop').remove();
            renderBar(); refresh();
            toast('Version restored', 'ok');
          } catch (error) { toast(error.message, 'error'); }
        } })]),
      ]));
    }
    table.appendChild(tbody);
    modal({
      title: 'Version history',
      wide: true,
      body: versions.length ? table : el('div', { class: 'empty', text: 'No earlier versions yet.' }),
      actions: (close) => [el('button', { text: 'Close', onclick: close })],
    });
  }

  function showPreview() {
    openPreview(state.doc, state.language);
  }

  function openSettings() {
    const body = el('div');
    const draw = () => {
      clear(body);
      body.appendChild(field('Form id', input(state.doc.formId, (v) => {
        state.doc.formId = v.trim(); markDirty(); scheduleValidate();
      }, { class: 'mono' }), 'the identifier Central and Collect use; changing it creates a separate form'));
      body.appendChild(field('Version', input(state.doc.version, (v) => { state.doc.version = v.trim(); markDirty(); }, { class: 'mono' }),
        'left blank, a timestamp is generated when you publish'));
      body.appendChild(field('Instance name', input(state.doc.instanceName, (v) => { state.doc.instanceName = v.trim(); markDirty(); }, { class: 'mono' }),
        'expression used to title each submission, e.g. concat(${village}, " ", ${hhid})'));
      body.appendChild(field('Style', select([
        { value: '', label: 'Default (one question per screen)' },
        { value: 'pages', label: 'pages' },
        { value: 'theme-grid', label: 'theme-grid' },
        { value: 'pages theme-grid', label: 'pages theme-grid' },
      ], state.doc.style, (v) => { state.doc.style = v; markDirty(); })));

      body.appendChild(el('h3', { text: 'Languages', style: 'margin-top:20px' }));
      const table = el('table', { class: 'grid' });
      const tbody = el('tbody');
      state.doc.languages.forEach((language) => {
        tbody.appendChild(el('tr', {}, [
          el('td', { text: language }),
          el('td', {}, [
            state.doc.defaultLanguage === language
              ? el('span', { class: 'pill ok', text: 'default' })
              : el('button', { class: 'mini', text: 'Make default', onclick: () => {
                state.doc.defaultLanguage = language; markDirty(); draw(); renderBar();
              } }),
          ]),
          el('td', { style: 'width:60px' }, [
            state.doc.languages.length > 1 ? el('button', { class: 'mini danger', text: '✕', onclick: async () => {
              const ok = await confirmDialog('Remove language',
                `Remove "${language}"? Labels written in it are removed from the questionnaire.`, 'Remove');
              if (!ok) return;
              state.doc.languages = state.doc.languages.filter((l) => l !== language);
              if (state.doc.defaultLanguage === language) state.doc.defaultLanguage = state.doc.languages[0];
              if (state.language === language) state.language = state.doc.defaultLanguage;
              const strip = (node) => {
                ['label', 'hint', 'constraintMessage', 'requiredMessage'].forEach((key) => {
                  if (node[key]) delete node[key][language];
                });
                (node.children || []).forEach(strip);
              };
              state.doc.items.forEach(strip);
              state.doc.choiceLists.forEach((l) => l.options.forEach((o) => { if (o.label) delete o.label[language]; }));
              markDirty(); draw(); renderBar(); refresh();
            } }) : null,
          ]),
        ]));
      });
      table.appendChild(tbody);
      body.appendChild(table);

      const newLanguage = input('', () => {}, { placeholder: 'e.g. Français (fr)' });
      body.appendChild(el('div', { style: 'display:flex; gap:10px; margin-top:12px' }, [
        newLanguage,
        el('button', { class: 'mini', text: 'Add language', onclick: () => {
          const value = newLanguage.value.trim();
          if (!value || state.doc.languages.includes(value)) return;
          state.doc.languages.push(value);
          markDirty(); draw(); renderBar();
        } }),
      ]));
      body.appendChild(el('p', { class: 'small muted', text:
        'Use the ODK convention "Name (code)", for example "English (en)". Collect and Enketo use the code to match device settings.' }));
    };
    draw();
    modal({
      title: 'Form settings',
      body,
      onClose: () => { refresh(); renderBar(); },
      actions: (close) => [el('button', { class: 'primary', text: 'Done', onclick: close })],
    });
  }

  // -- top bar ------------------------------------------------------------

  const barHost = el('div', { class: 'designer-bar' });

  function renderBar() {
    clear(barHost);
    const title = input(state.doc.title, (v) => { state.doc.title = v; markDirty(); }, { class: 'title-input' });
    barHost.appendChild(el('button', { class: 'ghost', text: '← Back', onclick: async () => {
      if (state.dirty) {
        const ok = await confirmDialog('Unsaved changes',
          'You have unsaved changes. Leave without saving?', 'Leave');
        if (!ok) return;
      }
      onExit();
    } }));
    barHost.appendChild(title);
    barHost.appendChild(el('span', { class: 'pill', text: state.doc.formId || 'no id' }));
    if (state.doc.languages.length > 1) {
      barHost.appendChild(select(
        state.doc.languages.map((l) => ({ value: l, label: l })),
        state.language,
        (v) => { state.language = v; refresh(); },
        { style: 'width:auto' },
      ));
    }
    barHost.appendChild(el('div', { class: 'spacer' }));
    barHost.appendChild(statusHost);
    barHost.appendChild(el('button', { text: 'Settings', onclick: openSettings }));
    barHost.appendChild(el('button', { text: 'Preview', onclick: showPreview }));
    barHost.appendChild(el('button', { text: 'History', onclick: openVersions }));
    barHost.appendChild(el('button', { text: 'XLSForm', title: 'Download as XLSForm', onclick: downloadXlsform }));
    barHost.appendChild(el('button', { text: 'Save', onclick: save }));
    barHost.appendChild(el('button', { class: 'primary', text: 'Publish to Central', onclick: openPublish }));
  }

  // -- assembly -----------------------------------------------------------

  const addBar = el('div', { class: 'panel-head' }, [
    el('h2', { text: 'Questionnaire' }),
    el('div', { class: 'spacer' }),
    el('button', { class: 'mini', text: '+ Question', onclick: () => addItem('question', 'text') }),
    el('button', { class: 'mini', text: '+ Section', onclick: () => addItem('group') }),
    el('button', { class: 'mini', text: '+ Repeat', onclick: () => addItem('group', 'repeat') }),
    el('button', { class: 'mini', text: 'Choice lists', onclick: () => openChoiceLists() }),
  ]);

  root.appendChild(barHost);
  root.appendChild(el('div', { class: 'designer' }, [
    el('div', {}, [
      el('div', { class: 'panel' }, [addBar, treeHost]),
      el('div', { class: 'panel', style: 'margin-top:18px' }, [issuesHost]),
    ]),
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [el('h2', { text: 'Properties' })]),
      propsHost,
    ]),
  ]));

  const onKeydown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      save();
    }
  };
  document.addEventListener('keydown', onKeydown);

  const onBeforeUnload = (event) => {
    if (state.dirty) { event.preventDefault(); event.returnValue = ''; }
  };
  window.addEventListener('beforeunload', onBeforeUnload);

  root.dispose = () => {
    document.removeEventListener('keydown', onKeydown);
    window.removeEventListener('beforeunload', onBeforeUnload);
  };

  renderBar();
  refresh();
  return root;
}
