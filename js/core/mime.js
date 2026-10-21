// File type detection, icons and default application associations.

const EXT = [
  [/\.(r|rmd|qmd)$/i, 'text/x-r', 'mimes/text-x-r'],
  [/\.(py|ipynb)$/i, 'text/x-python', 'mimes/text-x-python'],
  [/\.(sh|bash|zsh|lsf|bsub)$/i, 'text/x-sh', 'mimes/text-x-script'],
  [/\.(nf|wdl|smk|pl|java|c|cpp|h|js|ts|go|rs)$/i, 'text/x-source', 'mimes/text-x-script'],
  [/\.(csv|tsv|tab)$/i, 'text/tab-separated-values', 'mimes/text-csv'],
  [/\.(txt|log|out|err|cfg|conf|ini|config|yml|yaml|toml|netrc|renviron|rprofile|bashrc|profile)$/i, 'text/plain', 'mimes/text-plain'],
  [/\.(md|markdown|rst)$/i, 'text/markdown', 'mimes/text-markdown'],
  [/\.(html?|xml|svg)$/i, 'text/html', 'mimes/text-html'],
  [/\.json$/i, 'application/json', 'mimes/application-json'],
  [/\.pdf$/i, 'application/pdf', 'mimes/application-pdf'],
  [/\.(png|jpe?g|gif|webp|bmp)$/i, 'image/*', 'mimes/image'],
  [/\.(vcf|vcf\.gz|bcf|gvcf|g\.vcf\.gz)$/i, 'application/x-vcf', 'mimes/genomic-vcf'],
  [/\.(bam|cram|sam)$/i, 'application/x-bam', 'mimes/genomic-bam'],
  [/\.(bai|crai|tbi|csi|fai|idx)$/i, 'application/x-index', 'mimes/genomic-index'],
  [/\.(fa|fasta|fna|fa\.gz|fasta\.gz|2bit)$/i, 'application/x-fasta', 'mimes/genomic-fasta'],
  [/\.(fq|fastq|fq\.gz|fastq\.gz)$/i, 'application/x-fastq', 'mimes/genomic-fasta'],
  [/\.(bed|bedgraph|bigwig|bw|gtf|gff3?|gff)(\.gz)?$/i, 'application/x-bed', 'mimes/genomic-bed'],
  [/\.(gz|zip|tar|tgz|bz2|xz)$/i, 'application/gzip', 'mimes/application-archive'],
  [/\.(ods|xlsx|xls)$/i, 'application/x-spreadsheet', 'mimes/spreadsheet'],
  [/\.(odt|docx?|rtf)$/i, 'application/x-document', 'mimes/document'],
  [/\.(desktop)$/i, 'application/x-desktop', 'apps/application'],
];

export function mimeForPath(path) {
  const name = String(path).split('/').pop();
  if (/^\.(bashrc|profile|bash_profile|netrc|Renviron|Rprofile|bash_history|vimrc)$/i.test(name)) return 'text/plain';
  for (const [re, mime] of EXT) if (re.test(name)) return mime;
  return 'application/octet-stream';
}

export function iconForPath(path, type = 'file', { home } = {}) {
  if (type === 'dir' || type === 'mount') {
    const name = String(path).split('/').pop();
    if (home && path === home) return 'assets/icons/places/folder-home.svg';
    if (/^Desktop$/.test(name)) return 'assets/icons/places/folder-desktop.svg';
    if (/^Documents$/.test(name)) return 'assets/icons/places/folder-documents.svg';
    if (/^Downloads$/.test(name)) return 'assets/icons/places/folder-downloads.svg';
    if (type === 'mount') return 'assets/icons/places/folder-remote.svg';
    return 'assets/icons/places/folder.svg';
  }
  if (type === 'symlink-dir') return 'assets/icons/places/folder-remote.svg';
  const name = String(path).split('/').pop();
  for (const [re, , icon] of EXT) if (re.test(name)) return `assets/icons/${icon}.svg`;
  if (/^\./.test(name)) return 'assets/icons/mimes/text-plain.svg';
  return 'assets/icons/mimes/unknown.svg';
}

export function isTextMime(mime) {
  return mime.startsWith('text/') || mime === 'application/json' || mime === 'application/x-vcf-text';
}

/** Default application for a file (used by double-click in the file manager / desktop). */
export function defaultAppFor(path) {
  const mime = mimeForPath(path);
  const name = String(path).toLowerCase();
  if (mime === 'text/x-r') return 'rstudio';
  if (mime === 'text/x-python') return 'spyder';
  if (mime === 'application/x-bam' || mime === 'application/x-bed') return 'igv';
  if (mime === 'application/x-vcf') return name.endsWith('.gz') ? 'igv' : 'text-editor';
  if (mime === 'text/html' || mime === 'application/pdf' || mime === 'image/*') return 'web-browser';
  if (mime === 'application/gzip' || mime === 'application/octet-stream' || mime === 'application/x-index') return null;
  return 'text-editor';
}
