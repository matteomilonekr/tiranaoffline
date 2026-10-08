// Connect-to-Meta and Settings dialogs.

import { t, LANGUAGES, getLanguage } from './i18n.js';
import { h, svgIcon, openModal, closeModal, copyText } from './ui.js';
import { api } from './api.js';
import { BRAND } from './brand.js';

function closeButton() {
  return h('button', { class: 'icon-btn modal-close', type: 'button', 'aria-label': t('close'), title: t('close'), onclick: closeModal }, svgIcon('close'));
}

function installLine() {
  const code = h('code', { text: BRAND.installCommand });
  const btn = h('button', { class: 'btn', type: 'button' }, svgIcon('copy'), t('copy'));
  btn.addEventListener('click', async () => {
    const ok = await copyText(BRAND.installCommand, code);
    if (ok) {
      btn.lastChild.textContent = t('copied');
      setTimeout(() => (btn.lastChild.textContent = t('copy')), 1600);
    }
  });
  return h('div', { class: 'code-line' }, code, btn);
}

/** Shown on the published demo page, where there is no local server. */
export function openInstallModal() {
  openModal((card) => {
    card.append(
      closeButton(),
      h('h2', { id: 'modal-title', text: t('c.static.title') }),
      h('p', { class: 'lede', text: t('c.static.body') }),
      installLine(),
      h('p', { style: { marginTop: '12px' }, text: t('c.static.after') }),
      h('div', { class: 'trust' }, svgIcon('lock'), h('span', { text: t('c.trust') })),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-primary', type: 'button', onclick: closeModal, text: t('close') })),
    );
  });
}

/**
 * @param {{appId?:string, apiVersion?:string, onConnected:(status:Object)=>void}} opts
 */
export function openConnectModal(opts) {
  openModal((card) => {
    const input = h('textarea', { class: 'input', id: 'token-input', rows: '3', placeholder: t('c.tokenPlaceholder'), autocomplete: 'off', spellcheck: 'false' });
    const error = h('p', { class: 'form-error', role: 'alert', hidden: true });
    const submit = h('button', { class: 'btn btn-primary', type: 'submit', text: t('c.submit') });
    const form = h(
      'form',
      {},
      h('label', { class: 'field', for: 'token-input' }, h('span', { text: t('c.tokenLabel') }), input),
      error,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal, text: t('cancel') }), submit),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = input.value.trim().replace(/^Bearer\s+/i, '');
      if (!token) {
        input.focus();
        return;
      }
      submit.disabled = true;
      submit.textContent = t('c.checking');
      error.hidden = true;
      try {
        const status = await api.connect(token);
        closeModal();
        opts.onConnected(status);
      } catch (err) {
        error.textContent = err.kind === 'offline' ? t('err.server') : t('err.token', { msg: err.message });
        error.hidden = false;
        submit.disabled = false;
        submit.textContent = t('c.submit');
      }
    });

    const steps = h('ol', {}, ...['c.step1', 'c.step2', 'c.step3'].map((k) => h('li', { html: t(k) })));
    const nodes = [closeButton(), h('h2', { id: 'modal-title', text: t('c.title') }), h('p', { class: 'lede', text: t('c.lede') })];
    nodes.push(h('div', { class: 'trust' }, svgIcon('lock'), h('span', { text: t('c.trust') })));
    if (opts.appId) {
      const redirect = location.origin + '/oauth.html';
      const url = `https://www.facebook.com/${opts.apiVersion || 'v25.0'}/dialog/oauth?client_id=${encodeURIComponent(opts.appId)}&redirect_uri=${encodeURIComponent(redirect)}&response_type=token&scope=ads_read`;
      nodes.push(h('a', { class: 'btn btn-primary', href: url, style: { width: '100%', marginBottom: '12px' } }, t('c.fb')), h('p', { class: 'muted', style: { textAlign: 'center' }, text: t('c.or') }));
    }
    nodes.push(steps, form);
    card.append(...nodes);
  });
}

function segmented(name, options, value) {
  const group = h('div', { class: 'segmented', role: 'group', 'aria-label': name });
  for (const [v, label] of options) {
    const b = h('button', { type: 'button', 'aria-pressed': String(v === value), 'data-value': v, text: label });
    b.addEventListener('click', () => {
      group.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      group.dataset.value = v;
    });
    group.appendChild(b);
  }
  group.dataset.value = value;
  return group;
}

/**
 * @param {{settings:Object, staticPage:boolean, status:Object|null, onSave:(s:Object)=>void,
 *          onDisconnect:Function, onConnect:Function, onClearCache:Function}} opts
 */
export function openSettingsModal(opts) {
  const s = opts.settings;
  openModal((card) => {
    const lang = segmented(t('s.language'), LANGUAGES.map((l) => [l.code, l.label]), getLanguage());
    const sens = segmented(t('s.sensitivity'), [['strict', t('s.strict')], ['normal', t('s.normal')], ['loose', t('s.loose')]], s.sensitivity);
    const template = h('input', { class: 'input', id: 'naming-template', type: 'text', value: s.namingTemplate || '', placeholder: '{date}_{format}_{angle}_{persona}_{creator}_{hook}', spellcheck: 'false' });
    const sat = h('input', { class: 'input', id: 'saturation', type: 'number', min: '1', max: '12', step: '0.1', value: String(s.minSaturationFrequency ?? 2), style: { maxWidth: '110px' } });
    const active = h('input', { id: 'only-active', type: 'checkbox' });
    active.checked = !!s.onlyActive;

    const connection = [];
    if (opts.staticPage) {
      connection.push(h('p', { text: t('s.staticMode') }));
    } else if (opts.status?.connected) {
      connection.push(
        h('p', { text: t('s.connectedAs', { name: opts.status.user?.name || '—' }) }),
        h('div', { class: 'row' }, h('button', { class: 'btn btn-danger', type: 'button', onclick: () => { closeModal(); opts.onDisconnect(); }, text: t('acc.disconnect') }), h('button', { class: 'btn', type: 'button', onclick: () => { opts.onClearCache(); }, text: t('s.clearCache') })),
      );
    } else {
      connection.push(h('p', { text: t('s.notConnected') }), h('button', { class: 'btn', type: 'button', onclick: () => { closeModal(); opts.onConnect(); }, text: t('acc.connect') }));
    }

    const save = h('button', { class: 'btn btn-primary', type: 'button', text: t('s.save') });
    save.addEventListener('click', () => {
      const next = {
        ...s,
        lang: lang.dataset.value,
        sensitivity: sens.dataset.value,
        namingTemplate: template.value.trim(),
        minSaturationFrequency: Math.max(1, Math.min(12, Number(sat.value) || 2)),
        onlyActive: active.checked,
      };
      closeModal();
      opts.onSave(next);
    });

    card.append(
      closeButton(),
      h('h2', { id: 'modal-title', text: t('s.title') }),
      h('div', { class: 'field' }, h('span', { text: t('s.language') }), lang),
      h('div', { class: 'field' }, h('span', { text: t('s.sensitivity') }), sens, h('small', { text: t('s.sensitivity.help') })),
      h('label', { class: 'field', for: 'naming-template' }, h('span', { text: t('s.template') }), template, h('small', { text: t('s.template.help') })),
      h('label', { class: 'field', for: 'saturation' }, h('span', { text: t('s.saturation') }), sat, h('small', { text: t('s.saturation.help') })),
      h('label', { class: 'row', for: 'only-active', style: { marginBottom: '16px' } }, active, h('span', { text: t('s.onlyActive') })),
      h('div', { class: 'field' }, h('span', { text: t('s.connection') }), ...connection),
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn', type: 'button', onclick: closeModal, text: t('cancel') }), save),
    );
  });
}
