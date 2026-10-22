// The simulated user session: who is logged in, preferences and training controls.
import { CONFIG } from '../config.js';
import { kv } from './store.js';
import { bus } from './bus.js';

const DEFAULT_SETTINGS = {
  doubleClickDesktop: true,
  clock24h: true,
  showSeconds: false,
  // Training controls (Settings ▸ Training) — let instructors speed up the review processes.
  reviewDelayMs: CONFIG.submissions.simulatedReviewDelay,
  enforceExportWait: true,
  autoReview: true,
  // samtools, bcftools … need `module load` first (as on the HPC)
  requireModules: true,
};

export const session = {
  get user() {
    return kv.get('user', null) || { ...CONFIG.defaultUser };
  },

  set user(u) { kv.set('user', u); bus.emit('session:user', u); },

  get username() { return this.user.username; },

  get home() { return `/home/${this.username}`; },

  /** Working directory on the shared filesystem, e.g. /re_gecip/training/jdoe */
  get workdir() {
    const u = this.user;
    return u.group === 'discovery_forum' ? `/discovery_forum/df_${u.domain}/${u.username}` : `/re_gecip/${u.domain}/${u.username}`;
  },

  get loggedIn() { return kv.get('loggedIn', false); },
  set loggedIn(v) { kv.set('loggedIn', !!v); },

  get settings() { return { ...DEFAULT_SETTINGS, ...kv.get('settings', {}) }; },

  setSetting(key, value) {
    const s = kv.get('settings', {});
    s[key] = value;
    kv.set('settings', s);
    bus.emit('session:settings', this.settings);
  },

  /** Login with "initial+lastname" style username. */
  login({ username, fullName }) {
    const clean = String(username || '').trim().toLowerCase().replace(/[^a-z0-9._-]/g, '') || CONFIG.defaultUser.username;
    const prev = kv.get('user', null);
    const user = { ...CONFIG.defaultUser, ...(prev || {}), username: clean };
    if (fullName) user.fullName = fullName;
    else if (!prev || prev.username !== clean) user.fullName = guessFullName(clean);
    this.user = user;
    this.loggedIn = true;
    bus.emit('session:login', user);
  },

  logout() {
    this.loggedIn = false;
    bus.emit('session:logout');
  },
};

function guessFullName(u) {
  if (u === CONFIG.defaultUser.username) return CONFIG.defaultUser.fullName;
  const m = u.match(/^([a-z])([a-z]+)/);
  if (!m) return u;
  return `${m[1].toUpperCase()}. ${m[2][0].toUpperCase()}${m[2].slice(1)}`;
}
