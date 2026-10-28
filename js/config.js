// =============================================================================
// Central configuration for the Research Environment simulator.
// Change names, fake hostnames, releases and endpoints here — nothing else
// should hard-code them.
// =============================================================================

export const CONFIG = {
  // Used to namespace localStorage / IndexedDB so several copies can coexist.
  storageNamespace: 'gelre',

  environmentName: 'Research Environment',
  environmentShortName: 'RE',
  organisation: 'Genomics England',
  trainingBanner: 'Training simulator — no real participant data',
  // Name shown in the title bar of the simulated web browser.
  browserName: 'Web Browser',

  // Defaults for the simulated user (initial + lastname, as in the real RE).
  defaultUser: { username: 'jdoe', fullName: 'Jane Doe', group: 're_gecip', domain: 'training', userGroup: 'Research Network (Academic)' },

  // Hostnames shown in the terminal / panel.
  desktopHostname: 'ip-10-128-34-17',
  hpc: {
    loginHost: 'doublehelix.helix.prod.aws.gel.ac',
    loginNodeName: 'phpgridzlogn004',
    clusterName: 'helixprod',
    masterHost: 'lsfmaster001-helix0.helix.prod.aws.gel.ac',
    lsfVersion: 'IBM Spectrum LSF Standard 10.1.0.14, April 20 2023',
    queues: [
      { name: 'inter', prio: 50, maxRuntime: null, description: 'Interactive / GUI tools' },
      { name: 'short', prio: 30, maxRuntime: 4 * 60, description: 'Max runtime 4 hours' },
      { name: 'medium', prio: 20, maxRuntime: 24 * 60, description: 'Max runtime 24 hours' },
      { name: 'long', prio: 10, maxRuntime: null, description: 'Unlimited runtime (default 7 days)' },
    ],
    // LSF project codes (-P). "re_gecip_training" is valid for the simulated user.
    projectCodes: ['re_gecip_training', 'bio', 'gecip_training'],
  },

  // ---------------------------------------------------------------------------
  // The LabKey-like clinical data browser. Renamed so it is clearly a simulator.
  // rPackage / pyModule are the names the R and Python client shims register
  // under; they default to the real client names so documentation examples run
  // unchanged. Set them to e.g. 'Rlabkeeper' / 'labkeeper' if preferred.
  // ---------------------------------------------------------------------------
  dataBrowser: {
    productName: 'LabKeeper',
    tagline: 'Clinical & phenotype data browser',
    host: 'labkey.prod.aws.gel.ac',
    contextPath: 'labkey',
    acceptedHosts: ['labkey.prod.aws.gel.ac', 'labkey-embassy.gel.zone', 'labkey.embassy.local', 'labkeeper.re.local'],
    rPackage: 'Rlabkey',
    pyModule: 'labkey',
    defaultRows: 100,
    projects: [
      {
        name: 'main-programme',
        title: 'MAIN-PROGRAMME',
        description: '100,000 Genomes Project data releases. Use the most recent release for new work.',
        releases: [
          { folder: 'main-programme_v19_2024-10-31', schema: 'data/labkey/schema/main-programme_v19_2024-10-31.json', data: 'data/labkey/data/main-programme_v19_2024-10-31/', current: true },
        ],
      },
      {
        name: 'nhs-gms',
        title: 'NHS-GMS',
        description: 'Genomic and clinical data for NHS Genomic Medicine Service participants.',
        releases: [
          { folder: 'nhs-gms-release_v5_2025-08-28', schema: 'data/labkey/schema/nhs-gms-release_v5_2025-08-28.json', data: 'data/labkey/data/nhs-gms-release_v5_2025-08-28/', current: true },
        ],
      },
      { name: 'cohort-browser', title: 'COHORT BROWSER', description: 'Summary statistics for the 100kGP data release (not available in the simulator).', releases: [] },
      { name: 'frequent-release', title: 'FREQUENT-RELEASE', description: 'Data received on a more frequent schedule than the main releases (not available in the simulator).', releases: [] },
    ],
  },

  // Sites reachable from the simulated web browser. Anything else shows the
  // proxy "blocked" page, mirroring the RE whitelist.
  sites: {
    home: 're-home.local',
    docs: 're-docs.genomicsengland.co.uk',
    airlock: 'airlock.re.local',
    airlockRetrieval: 'airlock-retrieval.re.local',
    registry: 'research-registry.re.local',
    variantInterpreter: 'variant-interpreter.re.local',
  },

  // Real external sites that are whitelisted inside the RE. They cannot be
  // framed, so the browser offers to open them in a new tab instead.
  whitelist: [
    'www.ncbi.nlm.nih.gov', 'cancer.sanger.ac.uk', 'www.deciphergenomics.org', 'www.ebi.ac.uk', 'ensembl.org',
    'www.ensembl.org', 'gnomad.broadinstitute.org', 'medlineplus.gov', 'www.genenames.org', 'hpo.jax.org',
    'www.human-phenotype-ontology.org', 'igv.org', 'omim.org', 'panelapp.genomicsengland.co.uk',
    'pubmed.ncbi.nlm.nih.gov', 'www.hgmd.cf.ac.uk', 're-docs.genomicsengland.co.uk',
  ],

  // ---------------------------------------------------------------------------
  // Submissions (Airlock requests, research proposals).
  // mode 'local'  : stored in this browser only, with a simulated review.
  // mode 'appsScript': POSTed to a Google Apps Script web app (see apps-script/).
  // ---------------------------------------------------------------------------
  submissions: {
    mode: 'local',
    appsScriptUrl: '',
    // How long the simulated reviewers take (ms). Instructors can change in Settings.
    simulatedReviewDelay: 20000,
    // Export rule: project must have been approved this many days before export.
    exportWaitDays: 30,
    // When a project is approved, download the applicant's copy of the proposal (an HTML page) to their own computer.
    downloadApprovedProposal: true,
    // Projects every user is a member of (so Airlock practicals can start straight away).
    seedProjects: [
      { id: 'RR4001', title: 'Training: genomic diagnosis in rare disease (Research Environment course)', domain: 'training', lsfCode: 're_gecip_training', approvedDaysAgo: 120, lead: 'Course Organiser', institution: 'Training University',
        laySummary: 'A training project used in Research Environment practicals. Students explore rare disease participants, their phenotypes and their genomes, and learn how to export summary results through the Airlock.' },
    ],
  },

  // The workbench engine (assets/js, from the comparativechrono workbenches) and the libraries it loads.
  engine: {
    webrBase: 'https://webr.r-wasm.org/v0.6.0/',
    rRepos: ['https://repo.r-wasm.org', 'https://bioc-release.r-universe.dev', 'https://cran.r-universe.dev'],
    pyodideBase: 'https://cdn.jsdelivr.net/pyodide/v0.29.5/full/',
    pythonPreload: ['numpy', 'pandas', 'matplotlib'],
  },
  // Bumped when engine files change, so browsers fetch the new copies.
  buildId: '2026-10-22.6',

  cdn: {
    sqljs: 'assets/vendor/sqljs/',
  },
};
