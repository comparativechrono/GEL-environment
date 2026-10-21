// =============================================================================
// Top panel (xfce4-panel, Xubuntu layout):
//   [Whisker menu] [window buttons ...] [training pill] [tray] [clock] [user/power]
// =============================================================================

import { h, clear, pad, DAYS, MONTHS } from '../core/util.js';
import { showMenu } from '../core/menu.js';
import { toggleWhisker } from './whisker.js';

export function createPanel(RE) {
  const { wm, session, config } = RE;

  const whiskerBtn = h('button.panel-btn.whisker-btn', { title: 'Applications Menu' },
    h('img', { src: 'assets/icons/apps/re-logo.svg', alt: '' }), h('span', 'Applications'));
  whiskerBtn.addEventListener('click', () => toggleWhisker(RE, whiskerBtn));

  const showDesktop = h('button.panel-btn', { title: 'Show Desktop' }, h('img', { src: 'assets/icons/panel/show-desktop.svg', alt: '' }));
  showDesktop.addEventListener('click', () => {
    const anyVisible = wm.windows.some(w => !w.minimized);
    if (anyVisible) { showDesktop._restore = wm.windows.filter(w => !w.minimized); wm.minimizeAll(); }
    else (showDesktop._restore || []).forEach(w => !w.closed && w.focus());
  });

  const tasklist = h('div#tasklist');
  const buttons = new Map();

  function renderTasks() {
    const live = new Set(wm.windows);
    for (const [w, b] of buttons) if (!live.has(w)) { b.remove(); buttons.delete(w); }
    for (const w of wm.windows) {
      let b = buttons.get(w);
      if (!b) {
        b = h('button.task-btn', h('img', { alt: '' }), h('span'));
        b.addEventListener('click', () => {
          if (w.focused && !w.minimized) w.minimize(); else w.focus();
        });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); w.showWindowMenu(e.clientX, e.clientY); });
        b.addEventListener('auxclick', (e) => { if (e.button === 1) w.close(); });
        buttons.set(w, b);
        tasklist.appendChild(b);
      }
      b.querySelector('img').src = w.icon;
      b.querySelector('span').textContent = w.title;
      b.title = w.title;
      b.classList.toggle('focused', w.focused && !w.minimized);
      b.classList.toggle('minimized', w.minimized);
    }
  }
  wm.on('change', renderTasks);
  wm.on('open', renderTasks);
  wm.on('close', renderTasks);

  const pill = h('span.training-pill', { title: config.trainingBanner }, 'Training');

  const net = h('button.panel-btn', { title: 'Network: Wired connection (restricted)' }, h('img', { src: 'assets/icons/panel/network-wired.svg', alt: '' }));
  net.addEventListener('click', () => {
    const r = net.getBoundingClientRect();
    showMenu([
      { type: 'header', label: 'Wired connection' },
      { label: 'Connected — internet access restricted', disabled: true },
      { label: 'Only whitelisted websites are reachable', disabled: true },
      { type: 'separator' },
      { label: 'Whitelisted sites…', action: () => RE.apps.launchApp('web-browser', { url: 'https://re-home.local/whitelist' }) },
    ], { x: r.left, y: r.bottom });
  });

  const vol = h('button.panel-btn', { title: 'Volume: 0% (no audio device)' }, h('img', { src: 'assets/icons/panel/audio-volume-high.svg', alt: '' }));

  const bell = h('button.panel-btn', { title: 'Notifications' }, h('img', { src: 'assets/icons/panel/notifications.svg', alt: '' }));
  bell.addEventListener('click', () => {
    const r = bell.getBoundingClientRect();
    const log = RE.notificationLog || [];
    showMenu(log.length ? log.slice(-8).reverse().map(n => ({ label: `${n.time}  ${n.title}`, action: n.onClick }))
      : [{ label: 'No notifications', disabled: true }], { x: r.left - 160, y: r.bottom });
  });

  const clock = h('button.panel-btn.panel-clock');
  function tick() {
    const d = new Date();
    const s = session.settings;
    const hh = s.clock24h ? pad(d.getHours()) : ((d.getHours() % 12) || 12);
    clock.textContent = `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}  ${hh}:${pad(d.getMinutes())}${s.showSeconds ? ':' + pad(d.getSeconds()) : ''}${s.clock24h ? '' : (d.getHours() < 12 ? ' AM' : ' PM')}`;
    clock.title = d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  tick();
  setInterval(tick, 1000 * (session.settings.showSeconds ? 1 : 10));
  clock.addEventListener('click', () => {
    const r = clock.getBoundingClientRect();
    const d = new Date();
    showMenu([{ type: 'header', label: d.toDateString() }, { label: 'Time zone: Europe/London', disabled: true }], { x: r.left, y: r.bottom });
  });

  const userLabel = h('span');
  const power = h('button.panel-btn', { title: 'Session' }, h('img', { src: 'assets/icons/panel/system-shutdown.svg', alt: '' }), userLabel);
  const refreshUser = () => { userLabel.textContent = session.username; };
  refreshUser();
  RE.bus.on('session:user', refreshUser);
  power.addEventListener('click', () => {
    const r = power.getBoundingClientRect();
    showMenu([
      { type: 'header', label: `${session.user.fullName} (${session.username})` },
      { label: 'Settings', icon: 'assets/icons/actions/preferences-system.svg', action: () => RE.apps.launchApp('settings') },
      { type: 'separator' },
      { label: 'Lock Screen', icon: 'assets/icons/actions/system-lock-screen.svg', action: () => RE.shell.lock() },
      { label: 'Log Out', icon: 'assets/icons/actions/system-log-out.svg', action: () => RE.shell.logout() },
      { label: 'Power Off', icon: 'assets/icons/actions/system-shutdown.svg', action: () => RE.shell.powerOff() },
    ], { x: r.right - 220, y: r.bottom });
  });

  const panel = h('div#panel',
    whiskerBtn, h('div.panel-sep'), showDesktop, h('div.panel-sep'), tasklist,
    pill, h('div#systray', net, vol, bell), h('div.panel-sep'), clock, h('div.panel-sep'), power);

  return { el: panel, whiskerBtn, renderTasks };
}
