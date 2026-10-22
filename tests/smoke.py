#!/usr/bin/env python3
"""Smoke test of the Research Environment simulator, in headless Chromium.

    pip install playwright && python3 -m playwright install chromium
    python3 serve.py 8765 &          # in the repository's folder
    python3 tests/smoke.py           # all checks (R and Python take a few minutes the first time)
    python3 tests/smoke.py --quick   # without R and Python
    RE_BASE=https://comparativechrono.github.io/GEL-environment/ python3 tests/smoke.py --quick

Each check prints PASS or FAIL; the exit status is the number of failures. Screenshots are
written to tests/out/. R and Python are downloaded from their CDNs (webR, Pyodide), so the
full run needs the internet.
"""
import os
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ.get('RE_BASE', 'http://localhost:8765/')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')
QUICK = '--quick' in sys.argv
RELEASE = '/main-programme/main-programme_v19_2024-10-31'
BAM = '/genomes/by_date/2016-08-11/HX00100001/LP3000001-DNA_A01/Assembly/LP3000001-DNA_A01.bam'
HPC = 'doublehelix.helix.prod.aws.gel.ac'
PLUGINS = '/gel_data_resources/example_scripts/workshop_scripts/bcftools_plugins'
REPEATS = '/gel_data_resources/example_scripts/workshop_scripts/repeat_expansions/synthetic'
KINSHIP = '/gel_data_resources/example_scripts/workshop_scripts/relatedness'
# (is a SAM text coordinate-sorted? – by contig, as the records come, and then by position)
SORTED = "awk '$3==c && $4+0<p {bad++} {c=$3; p=$4+0} END{print (bad ? \"UNSORTED\" : \"COORDINATE-SORTED\"), NR}'"

results = []


def check(name, ok, detail=''):
    results.append((name, bool(ok)))
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  – {detail}" if detail and not ok else ''))


class Desktop:
    def __init__(self, page):
        self.page = page
        self.errors = []
        page.on('pageerror', lambda e: self.errors.append(str(e)))

    def js(self, code, arg=None):
        return self.page.evaluate(code, arg)

    def launch(self, app, args=None, wait=1.5):
        self.js('([a, b]) => RE.apps.launchApp(a, b || {})', [app, args])
        time.sleep(wait)

    def close_all(self):
        self.js('() => RE.wm.windows.slice().forEach((w) => w.close(true))')
        time.sleep(0.5)

    def type(self, cmd, wait=1.0):
        box = self.page.locator('.term-input').last
        box.click()
        box.fill(cmd)
        box.press('Enter')
        time.sleep(wait)

    def terminal_text(self):
        return self.page.locator('.term-out').last.inner_text()

    def shot(self, name):
        os.makedirs(OUT, exist_ok=True)
        self.page.screenshot(path=os.path.join(OUT, name + '.png'))

    def wait_for(self, code, seconds):
        for _ in range(int(seconds * 2)):
            if self.js(code):
                return True
            time.sleep(0.5)
        return False


def run():
    with sync_playwright() as pw:
        browser = pw.chromium.launch(args=['--no-sandbox'])
        page = browser.new_context(viewport={'width': 1400, 'height': 900}).new_page()
        d = Desktop(page)

        # ------------------------------------------------------------- the desktop
        page.goto(BASE + 'index.html?reset&user=jdoe&fast')
        page.wait_for_selector('#panel', timeout=60000)
        time.sleep(2)
        icons = d.js("() => document.querySelectorAll('.desk-icon').length")
        check('desktop: panel and icons', icons >= 10, f'{icons} icons')
        d.shot('desktop')

        # ------------------------------------------------------------ the terminal
        d.launch('terminal', wait=3)
        d.type('ls ~', 2)
        d.type('samtools --version', 1.5)
        d.type('module load samtools', 1)
        d.type(f'samtools view -H {BAM} | head -3', 8)
        t = d.terminal_text()
        check('terminal: links in the home folder', 'genomes' in t and 're_gecip' in t)
        check('terminal: samtools needs its module', 'module load' in t and 'command not found' in t)
        check('terminal: samtools reads a BAM header', '@HD' in t or '@SQ' in t, t[-300:])

        # ------------------------------------------- module avail: only what is there
        absent = d.js("() => RE.services.modules.modules().flatMap((m) => m.commands.filter((c) => !MG.shellTools[c] && !MG.shellBuiltins[c]).map((c) => m.name + ': ' + c))")
        check('modules: every command of every module exists', not absent, ', '.join(absent))
        # (SAMtools, BCFtools and HTSlib have the versions of hts-re.js's builds; every other module one version, the program's)
        wrong = d.js("""() => { const v = MG.wasm.versions, key = { subread: 'featurecounts', strelka: 'strelka2' };
            const hts = ['samtools', 'bcftools', 'htslib', 'tabix'], have = MG.wasm.htsVersions || [];
            return RE.services.modules.modules().filter((m) => hts.includes(m.name)
                ? !m.versions.length || m.versions.some((x) => !have.includes(x))
                : m.versions.length !== 1 || (v[key[m.name] || m.name] && v[key[m.name] || m.name] !== m.version))
              .map((m) => m.name + ' ' + m.versions.join(', ') + ' (the program: ' + (hts.includes(m.name) ? have.join(', ') : v[key[m.name] || m.name]) + ')'); }""")
        check('modules: their versions are those of the programs', not wrong, ', '.join(wrong))
        d.type('module avail', 1.5)
        t = d.terminal_text()
        listed = d.js("() => RE.services.modules.all()")
        check('modules: module avail lists the catalogue', all(m in t for m in listed), ', '.join(m for m in listed if m not in t))
        # (programs that run from assets/vendor/genomics-wasm, each in a worker of its own)
        d.type('module load subread salmon lofreq bustools', 1)
        d.type('featureCounts -v; salmon --version; lofreq version; bustools version', 20)
        t = d.terminal_text()
        check('modules: featureCounts, Salmon, LoFreq and bustools start', all(x in t for x in ('featureCounts v2.1.1', 'salmon 2.8.0', 'version: 2.1.5', 'bustools, version 0.45.1')), t[-400:])
        # (SAMtools, BCFtools and HTSlib 1.16 and 1.21: the module that is loaded decides which runs)
        d.type('module purge', 1)
        d.type('module load bcftools/1.16', 1)
        d.type('bcftools --version | head -2; module list', 8)
        t = d.terminal_text()
        check('modules: bcftools/1.16 loads htslib/1.16 and runs BCFtools 1.16', 'bcftools 1.16' in t and 'Using htslib 1.16' in t and 'htslib/1.16' in t, t[-400:])
        d.type('module load bcftools/1.21', 1.5)
        d.type(f'bcftools --version | head -1; bcftools +split-vep {PLUGINS}/trio-csq.vcf -l | head -3', 10)
        t = d.terminal_text()
        check('modules: bcftools/1.21 replaces 1.16, and has its plugins', 'bcftools/1.16 => bcftools/1.21' in t and 'bcftools 1.21' in t and 'Consequence' in t, t[-500:])
        # (samtools sort sorts – the builds before 22 October 2026 ended with status 0 and the records unsorted)
        d.type('module purge; module load samtools/1.21; cd ~', 1)
        d.type(f'samtools sort -n -o byname.bam {BAM} && samtools sort -o bycoord.bam byname.bam && samtools index bycoord.bam && echo "by name: $(samtools view byname.bam | {SORTED})" && echo "by position: $(samtools view bycoord.bam | {SORTED})"', 30)
        t = d.terminal_text()
        check('terminal: samtools sort sorts (by name, then back by position)', 'by name: UNSORTED' in t and 'by position: COORDINATE-SORTED' in t, t[-300:])
        # (ExpansionHunter → samtools sort and index → REViewer, with the synthetic sample)
        d.type('module load ExpansionHunter/5.0.0 REViewer/0.2.7', 1)
        d.type(f'ExpansionHunter --reads {REPEATS}/reads.bam --reference {REPEATS}/reference.fa --variant-catalog {REPEATS}/catalog.json --sex male --output-prefix smoke > eh.log && grep EXPANDED_CAG smoke.vcf | cut -f10', 20)
        t = d.terminal_text()
        check('repeats: ExpansionHunter calls the expanded repeat (12/77)', 'SPANNING/INREPEAT:12/77' in t, t[-300:])
        d.type(f'samtools sort -o smoke.sorted.bam smoke_realigned.bam && samtools index smoke.sorted.bam && REViewer --reads smoke.sorted.bam --vcf smoke.vcf --reference {REPEATS}/reference.fa --catalog {REPEATS}/catalog.json --locus EXPANDED_CAG --output-prefix smoke > rv.log && ls smoke.EXPANDED_CAG.svg && cat smoke.metrics.tsv', 25)
        t = d.terminal_text()
        check('repeats: REViewer draws the reads (SVG) and counts them', 'smoke.EXPANDED_CAG.svg' in t and '12/77' in t.split('smoke.EXPANDED_CAG.svg')[-1], t[-300:])
        # (relatedness with PLINK 2's KING-robust: the family and the duplicate of the synthetic cohort, the father's
        # pairs included – the pairs of the first sample, which this build gets wrong with an odd number of samples)
        d.type('module load plink2/2.0.0-b.1-dev', 1)
        d.type(f"plink2 --bfile {KINSHIP}/cohort --make-king-table --king-table-filter 0.0442 --out smoke_king > king.log && awk 'NR > 1 {{ print $2, $4, $8 }}' smoke_king.kin0", 25)
        t = d.terminal_text()
        check('relatedness: PLINK 2 finds the family and the duplicate (KING-robust)', all(x in t for x in ('DUP CHILD1 0.5', 'CHILD1 DAD 0.246479', 'CHILD2 DAD 0.245414', 'CHILD2 CHILD1 0.250246')), t[-400:])
        d.type('module purge', 1)

        # ------------------------------------------------------- the HPC and LSF
        d.type(f'ssh jdoe@{HPC}', 1.5)
        d.type('yes', 1.5)
        d.type('training', 2.5)
        d.type('bsub -q short -P re_gecip_training -o smoke.%J.out "echo smoke-test-ok"', 2)
        t = d.terminal_text()
        check('hpc: ssh to the login node', 'High Performance Cluster' in t and 'jdoe@phpgridzlogn004' in t, t[-300:])
        check('hpc: bsub submits a job', 'is submitted to queue <short>' in t, t[-300:])
        time.sleep(8)
        d.type('cat smoke.*.out | head -20', 2)
        check('hpc: the job ran and wrote its output', 'smoke-test-ok' in d.terminal_text() and 'Successfully completed' in d.terminal_text())
        d.type('exit', 1)
        d.shot('terminal')
        d.close_all()

        # ------------------------------------------------------ the data server
        n = d.js(f"async () => (await RE.services.labkey.selectRows({{ folderPath: '{RELEASE}', queryName: 'participant', maxRows: 5 }})).rows.length")
        check('data server: selectRows', n == 5, f'{n} rows')
        tables = d.js(f"async () => (await RE.services.labkey.tables('{RELEASE}')).length")
        check('data server: all tables of the release', tables > 100, f'{tables} tables')
        sql = d.js(f"""async () => {{ try {{ const r = await RE.services.labkey.executeSql({{ folderPath: '{RELEASE}', sql: 'SELECT COUNT(*) AS n FROM participant' }}); return r.rows[0].n; }} catch (e) {{ return String(e.message); }} }}""")
        check('data server: LabKey SQL', isinstance(sql, (int, float)) and sql > 0, str(sql))

        # ---------------------------------------------------------------- LabKeeper
        d.launch('labkeeper', wait=4)
        fr = page.frame_locator('iframe.bw-frame').first
        try:
            fr.locator('input[type=password]').fill('training')
            fr.locator('button[type=submit]').click()
            time.sleep(3)
            fr.locator('a.lk-project').first.click()
            time.sleep(3)
            fr.locator('.lk-folders a').first.click()
            time.sleep(4)
            fr.locator('.lk-dv-item a', has_text='participant').first.click()
            time.sleep(4)
            rows = fr.locator('table.lk-dr-table tbody tr').count()
            check('LabKeeper: sign in, Data Views, a grid', rows > 1, f'{rows} rows')
        except Exception as e:  # noqa: BLE001
            check('LabKeeper: sign in, Data Views, a grid', False, str(e)[:200])
        d.shot('labkeeper')
        d.close_all()

        # --------------------------------------------------------------------- IGV
        d.launch('igv', {'paths': [BAM]}, wait=2)
        ok = d.wait_for("() => { const w = RE.wm.byApp('igv')[0]; return !!(w && w.igvApp && w.igvApp.loaded && w.igvApp.loaded.length); }", 40)
        names = d.js("() => { const w = RE.wm.byApp('igv')[0]; return w && w.igvApp ? w.igvApp.loaded.map((t) => t.name).join(', ') : ''; }")
        check('IGV: a BAM file from /genomes', ok and 'LP3000001' in (names or ''), names)
        d.shot('igv')
        d.close_all()

        # ------------------------------------------------------------- the Airlock
        d.js("""() => RE.vfs.writeFile('/re_gecip/training/jdoe/smoke_counts.tsv', 'disease\\tn\\nIntellectual disability\\t12\\nHereditary ataxia\\t3\\n')""")
        findings = d.js("""async () => (await RE.services.submissions.precheck({ direction: 'export', form: 'findings', rrNumber: 'RR4001',
            description: 'Counts of participants by disease', justification: 'For a poster',
            files: [{ path: '/re_gecip/training/jdoe/smoke_counts.tsv' }] })).map((f) => f.level + ':' + f.rule)""")
        check('Airlock: a count below 5 fails the pre-check', 'fail:counts' in findings, ', '.join(findings))
        projects = d.js("() => RE.services.submissions.projects().map((p) => (p.id || p.ref) + ':' + p.status)")
        check('Research Registry: the training project is approved', any(p.startswith('RR4001:approved') for p in projects), ', '.join(projects))

        if not QUICK:
            # ------------------------------------------------------- R: Rlabkey
            d.js("() => RE.vfs.writeFile('/home/jdoe/.netrc', 'machine labkey.prod.aws.gel.ac\\nlogin jdoe\\npassword training\\n')")
            d.launch('rstudio', wait=2)
            ok = d.wait_for('() => !!(MG.app.rstudio && MG.app.rstudio.S && MG.app.rstudio.S.ready)', 240)
            if ok:
                time.sleep(2)
                for code in ['library(Rlabkey)',
                             'labkey.setDefaults(baseUrl = "https://labkey.prod.aws.gel.ac/labkey/")',
                             f'p <- labkey.selectRows(folderPath = "{RELEASE}", schemaName = "lists", queryName = "participant", colNameOpt = "rname")',
                             'cat("rows:", nrow(p), "\\n")']:
                    d.js('(c) => MG.app.rstudio.consoleRun(c)', code)
                    time.sleep(4)
                time.sleep(6)
                con = d.js("() => document.querySelector('.rs-conhost').innerText")
                check('R: Rlabkey reads a table', 'rows: ' in con and 'rows: 0' not in con, con[-400:])
            else:
                check('R: Rlabkey reads a table', False, 'R did not start')
            d.shot('rstudio')
            d.close_all()

            # --------------------------------------------------- Python: labkey
            d.launch('spyder', wait=2)
            ok = d.wait_for("() => !!(MG.app.spyder && MG.app.spyder.starting === false)", 240)
            if ok:
                d.js('(c) => MG.app.spyder.execute(c)',
                     'from labkey.api_wrapper import APIWrapper\n'
                     f'api = APIWrapper("labkey.prod.aws.gel.ac", "{RELEASE.lstrip("/")}", "labkey", use_ssl=True)\n'
                     'r = api.query.select_rows("lists", "participant", max_rows=5)\nprint("rowCount:", r["rowCount"])')
                ok = d.wait_for("() => /rowCount: \\d+/.test(MG.app.spyder.conScroll.innerText)", 120)
                con = d.js('() => MG.app.spyder.conScroll.innerText')
                check('Python: labkey reads a table', ok and 'rowCount: 0' not in con, con[-400:])
            else:
                check('Python: labkey reads a table', False, 'Python did not start')
            d.shot('spyder')

        check('no errors in the page', not d.errors, '; '.join(d.errors)[:400])
        browser.close()


if __name__ == '__main__':
    run()
    failed = sum(1 for _, ok in results if not ok)
    print(f'\n{len(results) - failed} passed, {failed} failed')
    sys.exit(failed)
