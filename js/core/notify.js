// xfce4-notifyd style desktop notifications.
import { h } from './util.js';

let host = null;

export function notify({ title, body = '', icon = 'assets/icons/status/dialog-information.svg', timeout = 6000, onClick } = {}) {
  if (!host) { host = h('div#notifications'); document.body.appendChild(host); }
  const el = h('div.notify', h('img', { src: icon, alt: '' }),
    h('div', h('div.n-title', title), body ? h('div.n-body', body) : null));
  const dismiss = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); };
  el.addEventListener('click', () => { dismiss(); onClick?.(); });
  host.appendChild(el);
  if (timeout) setTimeout(dismiss, timeout);
  return dismiss;
}
