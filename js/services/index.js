// Shared back-end services used by several apps.
//   services.labkey      — simulated LabKey-style server (SQLite per release)
//   services.lsf         — simulated LSF scheduler for the HPC
//   services.modules     — environment modules (module avail / load)
//   services.submissions — Airlock requests & research proposals (local or Apps Script)

export const services = {};

export async function initServices(RE) {
  const [{ createLabkeyServer }, { createLsf }, { createModules }, { createSubmissions }] = await Promise.all([
    import('./labkey-server.js'),
    import('./lsf.js'),
    import('./modules.js'),
    import('./submissions.js'),
  ]);
  services.labkey = createLabkeyServer(RE);
  services.lsf = createLsf(RE);
  services.modules = createModules(RE);
  services.submissions = createSubmissions(RE);
  return services;
}
