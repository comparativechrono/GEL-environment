// =============================================================================
// The browser's "DNS": which simulated site answers for which host name.
// A site is a same-origin page in sites/<name>/ that receives the virtual path
// in its location hash (sites/common/site.js keeps the two in step).
// =============================================================================

import { CONFIG } from '../../config.js';

const S = CONFIG.sites;
const DB = CONFIG.dataBrowser;

export const SITES = [
  { id: 'labkeeper', hosts: [DB.host, ...DB.acceptedHosts], page: 'sites/labkeeper/index.html', title: DB.productName, favicon: 'assets/icons/apps/labkeeper.svg', latency: [600, 1400], home: `/${DB.contextPath}/project/home/begin.view` },
  { id: 'airlock', hosts: [S.airlock], page: 'sites/airlock/index.html', title: 'Airlock', favicon: 'assets/icons/apps/airlock.svg', latency: [500, 1100], home: '/' },
  { id: 'registry', hosts: [S.registry], page: 'sites/registry/index.html', title: 'Research Registry', favicon: 'assets/icons/apps/research-registry.svg', latency: [500, 1100], home: '/' },
  { id: 'variant-interpreter', hosts: [S.variantInterpreter], page: 'sites/variant-interpreter/index.html', title: 'Variant interpreter', favicon: 'assets/icons/apps/variant-interpreter.svg', latency: [700, 1500], home: '/', hashRouting: true },
  { id: 'home', hosts: [S.home], page: 'sites/home/index.html', title: 'Research Environment', favicon: 'assets/icons/apps/re-logo.svg', latency: [200, 500], home: '/' },
];
// (Whitelisted external sites – the RE user guide, PanelApp, ClinVar … – refuse to be shown inside another page, so the
// simulated browser offers to open them in a tab of the person's own browser: see CONFIG.whitelist.)

/** Sites that are whitelisted in the real RE but cannot be shown inside this simulator (they refuse to be framed). */
export function isWhitelisted(host) {
  return CONFIG.whitelist.some(w => host === w || host.endsWith('.' + w));
}

// Web servers of the desktop's own programs (a Shiny app that RStudio runs, at http://127.0.0.1:PORT): host → its page
const LOCAL = new Map();

/** A program of the desktop serves web pages at host (127.0.0.1:PORT): the browser shows page (same origin) for it. */
export function addLocalSite(host, { page, title }) {
  const hh = String(host).toLowerCase();
  LOCAL.set(hh, { id: 'local', hosts: [hh], page, title: title || hh, favicon: 'assets/icons/apps/web-browser.svg', latency: [100, 300], home: '/', hashRouting: true });
}

export function siteFor(host) {
  const hh = String(host || '').toLowerCase();
  return SITES.find(s => s.hosts.includes(hh)) || LOCAL.get(hh) || null;
}

/** Normalise what was typed in the URL bar into a URL object, or {isSearch, query} for search terms. */
export function parseTyped(text) {
  let t = String(text || '').trim();
  if (!t) return null;
  if (/^(about|file):/i.test(t)) return new URL(t.replace(/^file:\/*/i, 'file:///'));
  if (t.startsWith('/')) return new URL('file://' + t);
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) {
    if (/\s/.test(t) || !/\.|^localhost/.test(t)) return { isSearch: true, query: t };
    t = 'https://' + t;
  }
  try { return new URL(t); } catch { return { isSearch: true, query: String(text) }; }
}
