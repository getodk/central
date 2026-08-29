// Small DOM helpers. Everything user-supplied goes in through textContent or
// these builders, never through innerHTML, so form content cannot inject markup.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') {
      Object.assign(node.dataset, value);
    } else if (value === true) {
      node.setAttribute(key, '');
    } else {
      node.setAttribute(key, value);
    }
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function field(labelText, control, hint) {
  return el('label', { class: 'field' }, [
    el('span', { class: 'label-text' }, [
      labelText,
      hint ? el('span', { class: 'hint', text: ` — ${hint}` }) : null,
    ]),
    control,
  ]);
}

export function input(value, onInput, attrs = {}) {
  const node = el('input', { type: 'text', ...attrs });
  node.value = value ?? '';
  node.addEventListener('input', () => onInput(node.value));
  return node;
}

export function textarea(value, onInput, attrs = {}) {
  const node = el('textarea', attrs);
  node.value = value ?? '';
  node.addEventListener('input', () => onInput(node.value));
  return node;
}

export function select(options, value, onChange, attrs = {}) {
  const node = el('select', attrs);
  for (const option of options) {
    const item = el('option', { value: option.value, text: option.label });
    if (option.group) item.dataset.group = option.group;
    node.appendChild(item);
  }
  node.value = value ?? '';
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

export function groupedSelect(options, value, onChange, attrs = {}) {
  const node = el('select', attrs);
  const groups = new Map();
  for (const option of options) {
    const key = option.group || '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(option);
  }
  for (const [name, items] of groups) {
    const parent = name ? el('optgroup', { label: name }) : node;
    for (const item of items) parent.appendChild(el('option', { value: item.value, text: item.label }));
    if (name) node.appendChild(parent);
  }
  node.value = value ?? '';
  node.addEventListener('change', () => onChange(node.value));
  return node;
}

export function checkbox(labelText, checked, onChange) {
  const box = el('input', { type: 'checkbox' });
  box.checked = !!checked;
  box.addEventListener('change', () => onChange(box.checked));
  return el('label', { class: 'checkbox' }, [box, el('span', { text: labelText })]);
}

export function toast(message, kind = '') {
  const host = document.getElementById('toasts');
  const node = el('div', { class: `toast ${kind}`.trim(), text: message });
  host.appendChild(node);
  setTimeout(() => {
    node.style.opacity = '0';
    node.style.transition = 'opacity .3s';
    setTimeout(() => node.remove(), 320);
  }, kind === 'error' ? 7000 : 3800);
}

export function modal({ title, body, actions, wide = false, onClose }) {
  const backdrop = el('div', { class: 'modal-backdrop' });

  const onKey = (event) => { if (event.key === 'Escape') close(); };
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    if (onClose) onClose();
  }

  const dialog = el('div', { class: `modal${wide ? ' wide' : ''}` }, [
    el('div', { class: 'modal-head' }, [
      el('h2', { text: title }),
      el('div', { class: 'spacer' }),
      el('button', { class: 'ghost', text: '\u2715', title: 'Close', onclick: close }),
    ]),
    el('div', { class: 'modal-body' }, [body]),
    actions ? el('div', { class: 'modal-foot' }, actions(close)) : null,
  ]);

  backdrop.appendChild(dialog);
  backdrop.addEventListener('mousedown', (event) => {
    if (event.target === backdrop) close();
  });
  document.addEventListener('keydown', onKey);
  document.body.appendChild(backdrop);
  return close;
}

export function confirmDialog(title, message, confirmLabel = 'Delete') {
  return new Promise((resolve) => {
    let answer = false;
    modal({
      title,
      body: el('p', { text: message }),
      onClose: () => resolve(answer),
      actions: (dismiss) => [
        el('button', { text: 'Cancel', onclick: dismiss }),
        el('button', {
          class: 'danger',
          text: confirmLabel,
          onclick: () => { answer = true; dismiss(); },
        }),
      ],
    });
  });
}

export function spinner() { return el('span', { class: 'spinner' }); }
