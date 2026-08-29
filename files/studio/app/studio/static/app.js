// Application shell: sign in, pick a project, then either design questionnaires
// or export data.

import { api, ApiError } from './api.js';
import { createDesigner } from './designer.js';
import { createExporter } from './exporter.js';
import { clear, confirmDialog, el, field, input, modal, select, spinner, toast } from './ui.js';

const appHost = document.getElementById('app');

const ctx = {
  user: null,
  projects: [],
  project: null,
  questionTypes: [],
  tab: 'design',
  view: null,
  typeSpec(type) {
    return this.questionTypes.find((t) => t.value === type) || {};
  },
};

// -- sign in ---------------------------------------------------------------

function renderSignIn(message) {
  appHost.className = '';
  clear(appHost);

  const email = el('input', { type: 'email', autocomplete: 'username', required: true });
  const password = el('input', { type: 'password', autocomplete: 'current-password', required: true });
  const error = el('p', { class: 'small', style: 'color:var(--danger)' });
  if (message) error.textContent = message;

  const submit = el('button', { class: 'primary', type: 'submit', text: 'Sign in', style: 'width:100%' });

  const form = el('form', {
    onsubmit: async (event) => {
      event.preventDefault();
      error.textContent = '';
      submit.disabled = true;
      submit.textContent = 'Signing in…';
      try {
        const result = await api.signIn(email.value.trim(), password.value);
        api.token = result.token;
        ctx.user = result.user;
        await start();
      } catch (err) {
        error.textContent = err.message;
        submit.disabled = false;
        submit.textContent = 'Sign in';
      }
    },
  }, [
    field('Email', email),
    field('Password', password),
    error,
    submit,
  ]);

  appHost.appendChild(el('div', { class: 'signin' }, [
    el('div', { class: 'panel' }, [
      el('div', { class: 'panel-body' }, [
        el('h1', {}, [document.createTextNode('Central '), el('span', { style: 'color:var(--accent)', text: 'Studio' })]),
        el('p', { class: 'lead', text: 'Design questionnaires and export data for Stata and SPSS.' }),
        form,
        el('p', { class: 'small muted', style: 'margin-top:18px', text:
          'Sign in with your ODK Central account. Studio uses your Central session, so you only see the projects you already have access to.' }),
      ]),
    ]),
  ]));
}

// -- shell -----------------------------------------------------------------

function renderShell() {
  appHost.className = '';
  clear(appHost);

  const projectPicker = select(
    ctx.projects.map((p) => ({ value: String(p.id), label: p.name + (p.archived ? ' (archived)' : '') })),
    ctx.project ? String(ctx.project.id) : '',
    (value) => {
      ctx.project = ctx.projects.find((p) => String(p.id) === value);
      localStorage.setItem('studio.project', value);
      renderBody();
    },
    { style: 'width:auto; max-width:260px' },
  );

  const tabs = el('div', { class: 'tabs' }, [
    tabButton('design', 'Questionnaires'),
    tabButton('export', 'Export data'),
  ]);

  appHost.appendChild(el('div', { class: 'topbar' }, [
    el('div', { class: 'brand' }, [document.createTextNode('Central '), el('span', { text: 'Studio' })]),
    projectPicker,
    tabs,
    el('div', { class: 'spacer' }),
    el('span', { class: 'who', text: ctx.user.displayName || ctx.user.email }),
    el('button', { class: 'ghost', text: 'Central', title: 'Back to ODK Central', onclick: () => { window.location.href = '/'; } }),
    el('button', { class: 'ghost', text: 'Sign out', onclick: signOut }),
  ]));

  const body = el('div', { class: 'page', id: 'body' });
  appHost.appendChild(body);
  renderBody();
}

function tabButton(key, label) {
  return el('button', {
    class: ctx.tab === key ? 'active' : '',
    text: label,
    onclick: () => { ctx.tab = key; renderShell(); },
  });
}

function renderBody() {
  const body = document.getElementById('body');
  if (ctx.view?.dispose) ctx.view.dispose();
  ctx.view = null;
  clear(body);
  body.className = 'page';

  if (!ctx.project) {
    body.appendChild(el('div', { class: 'panel' }, [
      el('div', { class: 'empty', text: 'You do not have access to any projects yet. Ask a Central administrator to add you to one.' }),
    ]));
    return;
  }

  if (ctx.tab === 'export') {
    ctx.view = createExporter(ctx);
    body.appendChild(ctx.view);
    return;
  }

  renderQuestionnaireList(body);
}

async function signOut() {
  try { await api.signOut(); } catch (_) { /* the token may already be gone */ }
  api.token = '';
  ctx.user = null;
  renderSignIn();
}

// -- questionnaire list ----------------------------------------------------

async function renderQuestionnaireList(body) {
  const host = el('div', { class: 'panel' });
  body.appendChild(host);

  const head = el('div', { class: 'panel-head' }, [
    el('h2', { text: 'Questionnaires' }),
    el('div', { class: 'spacer' }),
    el('button', { text: 'Import XLSForm', onclick: () => importXlsform(body) }),
    el('button', { class: 'primary', text: 'New questionnaire', onclick: () => newQuestionnaire(body) }),
  ]);
  host.appendChild(head);

  const loading = el('div', { class: 'empty' }, [spinner(), ' Loading…']);
  host.appendChild(loading);

  let records;
  try {
    records = await api.questionnaires(ctx.project.id);
  } catch (error) {
    loading.replaceWith(el('div', { class: 'empty', text: error.message }));
    return;
  }
  loading.remove();

  if (!records.length) {
    host.appendChild(el('div', { class: 'empty' }, [
      el('p', { text: 'No questionnaires in this project yet.' }),
      el('p', { class: 'small', text: 'Create one from scratch, or import an existing XLSForm to edit it here.' }),
    ]));
    return;
  }

  const tbody = el('tbody');
  for (const record of records) {
    tbody.appendChild(el('tr', {}, [
      el('td', {}, [
        el('div', { text: record.title || 'Untitled' }),
        el('div', { class: 'small mono muted', text: record.formId }),
      ]),
      el('td', { class: 'small', text: new Date(record.updatedAt).toLocaleString() }),
      el('td', { class: 'small', text: record.updatedBy || '—' }),
      el('td', {}, [
        record.publishedAs
          ? el('span', { class: 'pill ok', text: 'published' })
          : el('span', { class: 'pill', text: 'draft' }),
      ]),
      el('td', { style: 'width:150px' }, [
        el('button', { class: 'mini', text: 'Open', onclick: () => openDesigner(record.id, body) }),
        el('button', { class: 'mini danger', style: 'margin-left:6px', text: 'Delete', onclick: async () => {
          const ok = await confirmDialog('Delete questionnaire',
            `Delete "${record.title}"? This removes it from Studio only — forms already published to Central are not affected.`);
          if (!ok) return;
          try {
            await api.deleteQuestionnaire(record.id);
            renderBody();
          } catch (error) { toast(error.message, 'error'); }
        } }),
      ]),
    ]));
  }

  host.appendChild(el('table', { class: 'grid' }, [
    el('thead', {}, [el('tr', {}, [
      el('th', { text: 'Questionnaire' }), el('th', { text: 'Last edited' }),
      el('th', { text: 'By' }), el('th', { text: 'Status' }), el('th', { text: '' }),
    ])]),
    tbody,
  ]));
}

function newQuestionnaire(body) {
  const title = input('', () => {}, { placeholder: 'Household Income Survey 2026' });
  const formId = input('', () => {}, { class: 'mono', placeholder: 'household_income_2026' });

  // Suggest a form id from the title until the user types their own.
  let formIdEdited = false;
  formId.addEventListener('input', () => { formIdEdited = true; });
  title.addEventListener('input', () => {
    if (formIdEdited) return;
    formId.value = title.value.trim().toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || '';
  });

  modal({
    title: 'New questionnaire',
    body: el('div', {}, [
      field('Title', title, 'shown to interviewers'),
      field('Form id', formId, 'identifies the form in Central and Collect; letters, numbers, . - _'),
      el('p', { class: 'small muted', text: `It will be created in project "${ctx.project.name}".` }),
    ]),
    actions: (close) => [
      el('button', { text: 'Cancel', onclick: close }),
      el('button', { class: 'primary', text: 'Create', onclick: async (event) => {
        const name = title.value.trim();
        const id = formId.value.trim();
        if (!name || !id) { toast('A title and a form id are both required.', 'error'); return; }
        event.currentTarget.disabled = true;
        try {
          const record = await api.createQuestionnaire(ctx.project.id, {
            title: name, formId: id, version: '',
            languages: ['English (en)'], defaultLanguage: 'English (en)',
            choiceLists: [], items: [],
          });
          close();
          openDesigner(record.id, body);
        } catch (error) {
          event.currentTarget.disabled = false;
          toast(error.message, 'error');
        }
      } }),
    ],
  });
}

function importXlsform(body) {
  const picker = el('input', { type: 'file', accept: '.xlsx,.xls' });
  modal({
    title: 'Import an XLSForm',
    body: el('div', {}, [
      el('p', { class: 'small muted', text:
        'Upload an XLSForm workbook to open it in the designer. Question types the designer does not support yet are imported as text and listed afterwards.' }),
      picker,
    ]),
    actions: (close) => [
      el('button', { text: 'Cancel', onclick: close }),
      el('button', { class: 'primary', text: 'Import', onclick: async (event) => {
        const file = picker.files?.[0];
        if (!file) { toast('Choose a file first.', 'error'); return; }
        const button = event.currentTarget;
        button.disabled = true;
        button.textContent = 'Importing…';
        try {
          const result = await api.importXlsform(file);
          const record = await api.createQuestionnaire(ctx.project.id, result.document);
          close();
          if (result.warnings.length) {
            modal({
              title: 'Imported with notes',
              body: el('ul', {}, result.warnings.map((w) => el('li', { text: w }))),
              actions: (dismiss) => [el('button', { class: 'primary', text: 'Open designer', onclick: () => { dismiss(); openDesigner(record.id, body); } })],
            });
          } else {
            openDesigner(record.id, body);
          }
        } catch (error) {
          button.disabled = false;
          button.textContent = 'Import';
          toast(error.message, 'error');
        }
      } }),
    ],
  });
}

async function openDesigner(id, body) {
  clear(body);
  body.className = 'page wide';
  body.appendChild(el('div', { class: 'empty' }, [spinner(), ' Opening…']));
  try {
    const record = await api.questionnaire(id);
    clear(body);
    ctx.view = createDesigner(ctx, record, () => renderBody());
    body.appendChild(ctx.view);
  } catch (error) {
    clear(body);
    body.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty', text: error.message })]));
  }
}

// -- bootstrap -------------------------------------------------------------

async function start() {
  appHost.className = 'app-loading';
  appHost.textContent = 'Loading…';

  const [projects, types] = await Promise.all([api.projects(), api.questionTypes()]);
  ctx.projects = projects.filter((p) => !p.archived).concat(projects.filter((p) => p.archived));
  ctx.questionTypes = types.types;

  const remembered = localStorage.getItem('studio.project');
  ctx.project = ctx.projects.find((p) => String(p.id) === remembered) || ctx.projects[0] || null;

  renderShell();
}

window.addEventListener('studio:signed-out', () => {
  ctx.user = null;
  renderSignIn('Your session has expired. Please sign in again.');
});

(async function boot() {
  // Reuse the Central browser session when there is one, so signing in twice
  // is not the normal path.
  if (!api.token) {
    try {
      const adopted = await api.signInFromCookie();
      if (adopted?.token) { api.token = adopted.token; ctx.user = adopted.user; }
    } catch (_) { /* fall back to the sign-in form */ }
  }

  if (!api.token) { renderSignIn(); return; }

  try {
    ctx.user = ctx.user || await api.request('/me');
    await start();
  } catch (error) {
    api.token = '';
    renderSignIn(error instanceof ApiError && error.status !== 401 ? error.message : '');
  }
})();
