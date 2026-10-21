// =============================================================================
// Login flow. The real RE (Ubuntu VDI on Amazon WorkSpaces) asks for the
// username, password and 2FA verification code on three separate screens.
// The simulator accepts any password / 6-digit code.
// =============================================================================

import { h, clear, sleep } from '../core/util.js';

export function showLogin(RE, { mode = 'login' } = {}) {
  const { session, config } = RE;
  return new Promise((resolve) => {
    const root = h('div#login');
    const card = h('div.login-card');
    const footer = h('div.login-footer', `${config.organisation} ${config.environmentName} · ${config.trainingBanner}`);
    root.append(card, footer);
    document.body.appendChild(root);

    const state = { username: mode === 'unlock' ? session.username : (session.user?.username || ''), step: 0 };

    const brand = () => h('div.brand', h('img', { src: 'assets/icons/apps/re-logo.svg', alt: '' }),
      h('div', h('div.t1', config.environmentName), h('div.t2', mode === 'unlock' ? 'Session locked' : 'Sign in to your WorkSpace')));

    function stepper(n) {
      return h('div.steps', [0, 1, 2].map(i => h('span' + (i <= n ? '.done' : ''))));
    }

    function screen(n) {
      clear(card);
      state.step = n;
      const err = h('div.err');
      let input, title, hint, value;
      if (n === 0) {
        title = 'Username';
        hint = 'Your username is your first initial followed by your last name, for example jdoe.';
        input = h('input', { value: state.username, placeholder: 'e.g. jdoe', autocomplete: 'username', spellcheck: 'false' });
      } else if (n === 1) {
        title = `Password for ${state.username}`;
        hint = 'Training simulator: any password is accepted.';
        input = h('input', { type: 'password', placeholder: 'Password', autocomplete: 'current-password' });
      } else {
        title = 'Verification code';
        hint = 'Enter the 6-digit code from your authenticator app. (Training simulator: any 6 digits work.)';
        input = h('input', { inputmode: 'numeric', maxlength: 6, placeholder: '123456', autocomplete: 'one-time-code' });
      }
      const next = h('button.gtk-btn.suggested', n === 2 ? 'Sign in' : 'Next');
      const back = n > 0 && mode !== 'unlock' ? h('button.linkish', { onclick: () => screen(n - 1) }, '‹ Back') : h('span');
      const submit = async () => {
        value = input.value.trim();
        if (n === 0) {
          if (!/^[a-z][a-z0-9._-]{1,30}$/i.test(value)) { err.textContent = 'Please enter a valid username (letters and numbers).'; return; }
          state.username = value.toLowerCase();
          screen(1);
        } else if (n === 1) {
          if (!value) { err.textContent = 'Please enter your password.'; return; }
          screen(2);
        } else {
          if (!/^\d{6}$/.test(value)) { err.textContent = 'The verification code must be 6 digits.'; return; }
          await finish();
        }
      };
      next.addEventListener('click', submit);
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      card.append(brand(), stepper(n), h('div.login-step-title', title), input, err, h('div.hint', hint), h('div.row', back, next));
      if (mode === 'login' && n === 0) {
        card.appendChild(h('div.hint', { style: { marginTop: '14px' } },
          h('button.linkish', { onclick: () => { state.username = config.defaultUser.username; input.value = state.username; } }, 'Use the training account'),
          ' · ',
          h('button.linkish', { onclick: () => { state.username = (input.value || config.defaultUser.username).toLowerCase(); finish(); } }, 'Skip sign-in')));
      }
      setTimeout(() => input.focus(), 30);
    }

    async function finish() {
      clear(card);
      card.append(brand(), h('div.login-splash', h('div.gtk-spinner'), h('div', mode === 'unlock' ? 'Unlocking…' : 'Connecting to your WorkSpace…')));
      if (mode !== 'unlock') session.login({ username: state.username });
      await sleep(mode === 'unlock' ? 400 : 1100);
      root.style.transition = 'opacity .35s ease';
      root.style.opacity = '0';
      setTimeout(() => root.remove(), 360);
      resolve(state.username);
    }

    screen(mode === 'unlock' ? 1 : 0);
  });
}

export async function showReconnect(RE) {
  const root = h('div#login', h('div.login-splash', h('div.gtk-spinner'), h('div', 'Reconnecting to your WorkSpace…')));
  document.body.appendChild(root);
  await sleep(700);
  root.style.transition = 'opacity .35s ease';
  root.style.opacity = '0';
  setTimeout(() => root.remove(), 360);
}

export async function showPowerOff(RE) {
  const msg = h('div', 'Stopping your WorkSpace…');
  const root = h('div#login', h('div.login-splash', h('div.gtk-spinner'), msg));
  document.body.appendChild(root);
  await sleep(1800);
  msg.textContent = 'Your WorkSpace has been stopped. It can take a few minutes before you can sign in again.';
  await sleep(1800);
  root.remove();
}
