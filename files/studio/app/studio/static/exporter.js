// Export screen: pick a form, choose how codes and labels should be written,
// and download a zip of Stata/SPSS/CSV files plus a codebook.

import { api, saveResponse } from './api.js';
import { checkbox, clear, el, field, input, select, spinner, toast } from './ui.js';

const REVIEW_FILTERS = [
  { value: '', label: 'All submissions' },
  { value: "__system/reviewState eq 'approved'", label: 'Approved only' },
  { value: "__system/reviewState ne 'rejected'", label: 'Everything except rejected' },
];

export function createExporter(ctx) {
  const state = {
    formId: null,
    meta: null,
    options: {
      formats: ['stata', 'spss'],
      language: null,
      valueCoding: 'numeric',
      splitSelectMultiples: true,
      keepMultipleRaw: true,
      dropAttachments: false,
      stataVersion: 15,
      filter: '',
    },
  };

  const root = el('div');
  const formsHost = el('div', { class: 'panel' });
  const optionsHost = el('div');

  async function loadForms() {
    clear(formsHost);
    formsHost.appendChild(el('div', { class: 'panel-head' }, [
      el('h2', { text: 'Forms' }),
      el('div', { class: 'spacer' }),
      el('span', { class: 'muted small', text: ctx.project.name }),
    ]));
    const loading = el('div', { class: 'empty' }, [spinner(), ' Loading forms…']);
    formsHost.appendChild(loading);

    let forms;
    try {
      forms = await api.forms(ctx.project.id);
    } catch (error) {
      loading.replaceWith(el('div', { class: 'empty', text: error.message }));
      return;
    }

    loading.remove();
    if (!forms.length) {
      formsHost.appendChild(el('div', { class: 'empty', text: 'This project has no forms yet.' }));
      return;
    }

    const tbody = el('tbody');
    for (const form of forms) {
      const row = el('tr', {
        style: 'cursor:pointer',
        onclick: () => selectForm(form),
      }, [
        el('td', {}, [
          el('div', { text: form.name }),
          el('div', { class: 'small mono muted', text: form.xmlFormId }),
        ]),
        el('td', { class: 'small', text: form.version || '—' }),
        el('td', {}, [el('span', { class: `pill ${form.state === 'open' ? 'ok' : ''}`.trim(), text: form.state || 'open' })]),
        el('td', { class: 'small', text: form.submissions == null ? '—' : String(form.submissions) }),
        el('td', {}, [el('button', { class: 'mini', text: 'Export' })]),
      ]);
      if (state.formId === form.xmlFormId) row.style.background = 'var(--accent-soft)';
      tbody.appendChild(row);
    }

    formsHost.appendChild(el('table', { class: 'grid' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { text: 'Form' }), el('th', { text: 'Version' }),
        el('th', { text: 'State' }), el('th', { text: 'Submissions' }), el('th', { text: '' }),
      ])]),
      tbody,
    ]));
  }

  async function selectForm(form) {
    state.formId = form.xmlFormId;
    state.meta = null;
    await loadForms();
    clear(optionsHost);
    const loading = el('div', { class: 'panel' }, [el('div', { class: 'empty' }, [spinner(), ' Reading the form definition…'])]);
    optionsHost.appendChild(loading);
    try {
      state.meta = await api.formMeta(ctx.project.id, form.xmlFormId);
      state.options.language = state.meta.defaultLanguage;
    } catch (error) {
      clear(optionsHost);
      optionsHost.appendChild(el('div', { class: 'panel' }, [el('div', { class: 'empty', text: error.message })]));
      return;
    }
    renderOptions();
  }

  function toggleFormat(name, on) {
    const set = new Set(state.options.formats);
    if (on) set.add(name); else set.delete(name);
    state.options.formats = [...set];
  }

  function renderOptions() {
    clear(optionsHost);
    const meta = state.meta;

    const facts = el('div', { class: 'panel-body' }, [
      el('div', { class: 'row' }, [
        fact('Questions', String(meta.fieldCount)),
        fact('Submissions', meta.submissions == null ? 'unknown' : String(meta.submissions)),
        fact('Repeat groups', meta.repeats.length ? meta.repeats.join(', ') : 'none'),
        fact('Languages', meta.languages.length ? String(meta.languages.length) : '1'),
      ]),
      meta.repeats.length ? el('p', { class: 'small muted', style: 'margin:12px 0 0', text:
        'Each repeat group is written as its own file. Join it to the main table on PARENT_KEY = KEY.' }) : null,
    ]);

    const body = el('div', { class: 'panel-body' });

    body.appendChild(el('h3', { text: 'Formats' }));
    body.appendChild(el('div', { class: 'row', style: 'margin-bottom:6px' }, [
      checkbox('Stata (.dta)', state.options.formats.includes('stata'), (v) => toggleFormat('stata', v)),
      checkbox('SPSS (.sav)', state.options.formats.includes('spss'), (v) => toggleFormat('spss', v)),
      checkbox('CSV', state.options.formats.includes('csv'), (v) => toggleFormat('csv', v)),
    ]));
    body.appendChild(field('Stata version', select([
      { value: '15', label: 'Stata 14 and later (recommended)' },
      { value: '14', label: 'Stata 13' },
      { value: '13', label: 'Stata 12' },
    ], String(state.options.stataVersion), (v) => { state.options.stataVersion = Number(v); })));

    body.appendChild(el('h3', { text: 'Labels and codes', style: 'margin-top:20px' }));
    if (meta.languages.length > 1) {
      body.appendChild(field('Label language', select(
        meta.languages.map((l) => ({ value: l, label: l })),
        state.options.language,
        (v) => { state.options.language = v; },
      ), 'variable and value labels are taken from this translation'));
    }
    body.appendChild(field('Single-select answers', select([
      { value: 'numeric', label: 'Numeric codes with value labels (recommended)' },
      { value: 'string', label: 'Original text codes' },
    ], state.options.valueCoding, (v) => { state.options.valueCoding = v; }),
      'numeric coding keeps the form’s own codes where they are already numbers'));

    body.appendChild(el('h3', { text: 'Multiple-select questions', style: 'margin-top:20px' }));
    body.appendChild(checkbox('Add a 0/1 column per choice', state.options.splitSelectMultiples,
      (v) => { state.options.splitSelectMultiples = v; }));
    body.appendChild(checkbox('Also keep the original combined answer', state.options.keepMultipleRaw,
      (v) => { state.options.keepMultipleRaw = v; }));

    body.appendChild(el('h3', { text: 'Rows and columns', style: 'margin-top:20px' }));
    body.appendChild(field('Include', select(REVIEW_FILTERS, state.options.filter, (v) => { state.options.filter = v; })));
    body.appendChild(checkbox('Leave out attachment filename columns', state.options.dropAttachments,
      (v) => { state.options.dropAttachments = v; }));

    const status = el('div', { class: 'small muted', style: 'margin-top:14px' });
    const button = el('button', { class: 'primary', text: 'Prepare and download', onclick: () => run(button, status) });
    body.appendChild(el('div', { style: 'margin-top:20px; display:flex; gap:12px; align-items:center' }, [button, status]));

    optionsHost.appendChild(el('div', { class: 'panel' }, [
      el('div', { class: 'panel-head' }, [
        el('h2', { text: meta.title || state.formId }),
        el('div', { class: 'spacer' }),
        el('span', { class: 'pill mono', text: state.formId }),
      ]),
      facts,
    ]));
    optionsHost.appendChild(el('div', { class: 'panel', style: 'margin-top:18px' }, [
      el('div', { class: 'panel-head' }, [el('h2', { text: 'Export options' })]),
      body,
    ]));
  }

  function fact(label, value) {
    return el('div', {}, [
      el('div', { class: 'small muted', text: label }),
      el('div', { style: 'font-weight:600', text: value }),
    ]);
  }

  async function run(button, status) {
    if (!state.options.formats.length) {
      toast('Choose at least one output format.', 'error');
      return;
    }
    button.disabled = true;
    clear(status);
    status.appendChild(spinner());
    status.appendChild(document.createTextNode(' Building the dataset — this can take a minute for large forms.'));
    try {
      const response = await api.exportData({
        projectId: ctx.project.id,
        xmlFormId: state.formId,
        formats: state.options.formats,
        language: state.options.language,
        valueCoding: state.options.valueCoding,
        splitSelectMultiples: state.options.splitSelectMultiples,
        keepMultipleRaw: state.options.keepMultipleRaw,
        dropAttachments: state.options.dropAttachments,
        stataVersion: state.options.stataVersion,
        filter: state.options.filter || null,
      });
      await saveResponse(response, `${state.formId}.zip`);
      status.textContent = 'Download started. The zip contains your data files, a codebook and a README.';
      toast('Export ready', 'ok');
    } catch (error) {
      status.textContent = '';
      toast(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  }

  root.appendChild(formsHost);
  root.appendChild(el('div', { style: 'height:18px' }));
  root.appendChild(optionsHost);
  loadForms();
  return root;
}
