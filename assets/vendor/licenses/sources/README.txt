The source code of the bundled programs that are under the GNU General Public License
=====================================================================================
Seventeen archives belong in this folder (../README.txt and ../source-archives.json describe them):

  bowtie2-2.4.2.tar.xz    coreutils-8.32.tar.xz   diffutils-3.10.tar.xz   FastTree-2.1.11.c.xz
  gawk-5.1.0.tar.xz       grep-3.7.tar.xz         grep-3.11.tar.xz        kalign-3.3.1.tar.xz
  pcre2-10.42.tar.bz2     sed-4.8.tar.xz
  bwa-b92993c1161e73167181558856567ef2f367e3f0.tar.gz      zlib-1.3.1.tar.gz
  hisat2-99583d7536b9ee017ac07de8834017a3bf99a2fe.tar.gz   freebayes-1.3.6-recursive.tar.xz
  simde-0.8.2.tar.gz
  plink-ng-72119068234ce0acf7189e53dfe67a527bc53e2c.tar.gz (PLINK 2)   zlib-1.3.2-github.tar.gz (zlib, in PLINK 2)

The GNU General Public License asks whoever passes these programs on – and a public web site does –
to offer their source code with them. Keep the archives here, with the site. (zlib, SIMDe and PCRE2
are not GPL themselves; they are part of GPL programs here – BWA, HISAT2, FreeBayes, PLINK 2 and grep -P.)

They are the same files as in the bioinformatics workbench (comparativechrono/bioinformatics-workbench,
assets/vendor/licenses/sources/, commit 3f656f082b2c3bed09393f8614cdddadab5192a5), limited to the
programs that this site bundles. Their checksums are in ../SHA256SUMS:

  cd .. && sha256sum -c SHA256SUMS
