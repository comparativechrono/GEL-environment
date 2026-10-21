// =============================================================================
// The Research Environment start page (the web browser's home page):
// the RE's web tools, a getting-started route through them, notices, and the
// list of whitelisted websites (/whitelist).
// =============================================================================

import { RE, h, clear, route, setTitle, requireDesktop } from '../common/site.js';

const app = document.getElementById('home-app');

function hero(title, text) {
  return h('div.hm-hero', h('div.s-page', h('h1', h('img', { src: '../../assets/icons/apps/re-logo.svg', alt: '' }), title), h('p', text)));
}

function home() {
  clear(app);
  setTitle('Research Environment');
  const C = RE.config;
  const user = RE.session.user;
  const tile = (href, icon, title, text) => h('a.hm-tile', { href }, h('img', { src: `../../assets/icons/apps/${icon}.svg`, alt: '' }), h('b', title), h('span', text));
  const main = h('div.s-page',
    h('div.hm-tiles',
      tile(`https://${C.dataBrowser.host}/${C.dataBrowser.contextPath}/project/home/begin.view`, 'labkeeper', C.dataBrowser.productName, 'The participants’ clinical and phenotype data, release by release.'),
      tile(`https://${C.sites.registry}/`, 'research-registry', 'Research Registry', 'Register your project and follow its review.'),
      tile(`https://${C.sites.airlock}/`, 'airlock', 'Airlock', 'Export results – or import files – after review.'),
      tile(`https://${C.sites.variantInterpreter}/`, 'variant-interpreter', 'Variant interpreter', 'Interpret variants with the ACMG/AMP criteria.')),
    h('div.hm-cols',
      h('div',
        h('div.s-card', h('h2', 'Getting started'), h('ol.hm-steps',
          h('li', h('b', 'Find your cohort. '), `Open ${C.dataBrowser.productName}, choose the most recent data release, and filter the tables (participant, rare_diseases_participant_disease …). Export the rows, or copy the R / Python script that fetches them.`),
          h('li', h('b', 'Find the files. '), 'The genome_file_paths_and_types table gives the path of each participant’s BAM and VCF files in /genomes. Never browse /genomes to find files: it also holds genomes of participants who have withdrawn.'),
          h('li', h('b', 'Analyse. '), `Work in RStudio, Spyder or the Terminal, and keep your work in /re_gecip/${user.domain || 'training'}/${user.username}. Larger jobs run on the HPC: ssh ${user.username}@${C.hpc.loginHost}, then bsub -P <project code>.`),
          h('li', h('b', 'Look at the reads. '), 'Open BAM and VCF files in IGV (File ▸ Load from File…) to check variants by eye.'),
          h('li', h('b', 'Take results out. '), 'Only through the Airlock, for an approved project: summary results only, counts below 5 masked.'))),
        h('div.s-card', h('h2', 'The command line'), h('pre', { style: { background: '#f4f6f8', padding: '10px 12px', borderRadius: '5px', overflow: 'auto', fontSize: '12.5px', margin: 0 } },
          `module avail                   # software on the desktop and the HPC\nmodule load samtools/1.21      # then: samtools view …\nssh ${user.username}@${C.hpc.loginHost}\nbsub -q short -P re_gecip_${user.domain || 'training'} -o job.%J.out "samtools flagstat file.bam"\nbjobs                          # your jobs`))),
      h('div',
        h('div.s-card', h('h2', 'Notices'), h('ul.hm-news',
          h('li', h('span.d', 'Training simulator'), 'Everything here runs in your web browser. The data are synthetic or public, and nothing you do reaches Genomics England.'),
          h('li', h('span.d', 'Data releases'), `The current releases are listed in ${C.dataBrowser.productName}. Analyses should use the latest release.`),
          h('li', h('span.d', 'HPC'), 'Use the short queue for jobs of up to 4 hours, medium for 24 hours, long beyond. Interactive work: bsub -q inter -Is bash.'))),
        h('div.s-card', h('h2', 'Help'), h('ul', { style: { margin: 0, paddingLeft: '18px' } },
          h('li', h('a', { href: 'https://re-docs.genomicsengland.co.uk/' }, 'Research Environment user guide')),
          h('li', h('a', { href: '/whitelist' }, 'Whitelisted websites')),
          h('li', h('a', { href: `https://${C.sites.airlock}/rules` }, 'Airlock rules')),
          h('li', h('a', { href: `https://${C.sites.registry}/process` }, 'How proposals are reviewed')))))));
  app.append(hero(`Welcome to the ${C.environmentName}, ${(user.fullName || user.username).split(' ')[0]}`, `${C.organisation}’s secure environment for analysing participants’ data. ${C.trainingBanner}.`), main);
}

function whitelist() {
  clear(app);
  setTitle('Whitelisted websites');
  const sites = RE.config.whitelist.slice().sort();
  app.append(hero('Whitelisted websites', 'The Research Environment has no general internet access. These reference websites can be reached from its browser.'),
    h('div.s-page', h('div.s-card',
      h('p', 'Every other website is blocked by the proxy. In the simulator, whitelisted websites open in a tab of your own browser, because they cannot be shown inside another page.'),
      h('ul.hm-wl', sites.map(s => h('li', h('a', { href: `https://${s}/` }, s)))))));
}

function render({ path }) {
  if (path === '/whitelist') return whitelist();
  return home();
}

if (requireDesktop()) route(render);
