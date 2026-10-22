Repeat expansions – ExpansionHunter and REViewer, with small example data
=========================================================================

Training simulator: the files here are small examples from the genomics-wasm project
(https://github.com/comparativechrono/genomics-wasm, datasets/repeats/), which checks its builds of ExpansionHunter
5.0.0 and REViewer 0.2.7 with them. The folder is read-only: write your results into your own folder.

  synthetic/                 a made-up sample – no real person: reads on artificial 8,000-base contigs, each with a CAG
                             repeat at 4,001-4,036 (twelve units in the reference)
                               NORMAL_CAG    chr1   12 and 18 units
                               EXPANDED_CAG  chr2   12 and 75 units – longer than a read (150 bases)
                               X_CAG         chrX   18 units: a male sample has one X (use --sex male)
                             catalog.json: the three loci; truth.json: the counts the reads were made from
  expansionhunter_example/   ExpansionHunter's own example (its repository, release 5.0.0; Apache 2.0, LICENSE.txt):
                             an SNV next to a CAG repeat. expected.vcf and expected.json are the results in that
                             repository, written by an earlier version: the same genotypes (SNV 0/1, CAG 2/10), some
                             counts and the header differ
  reviewer_example/          REViewer's own test input (its repository, release 0.2.7; GNU GPL 3, LICENSE.txt): the
                             BAMlet of the 1000 Genomes sample HG00684 at BEAN1, its VCF and catalog. reference.fa.gz is
                             chromosome 16 of hg38 with only the bases within 2,000 of the catalog's loci kept (the rest
                             is N; reference-mask.json lists them) – for this example only

The workflow (copy the lines into the terminal; the job script run_expansionhunter.sh does the same on the HPC):

  module load ExpansionHunter/5.0.0 samtools/1.21 REViewer/0.2.7
  D=/gel_data_resources/example_scripts/workshop_scripts/repeat_expansions
  mkdir -p /re_gecip/training/$USER/repeats && cd /re_gecip/training/$USER/repeats

1. Genotype the repeats (the reads, the reference and the catalog; the BAM needs its .bai, the reference its .fai):

  ExpansionHunter --reads $D/synthetic/reads.bam --reference $D/synthetic/reference.fa \
      --variant-catalog $D/synthetic/catalog.json --sex male --output-prefix synthetic
  ls                                       synthetic.vcf, synthetic.json, synthetic_realigned.bam
  grep -v '^##' synthetic.vcf | cut -f1,2,5,10
      GT:SO:REPCN:REPCI:… – REPCN: the repeat count of each allele; REPCI: its confidence interval. An allele longer
      than the reads is estimated: EXPANDED_CAG's long allele comes out near 75, with an interval around it.
  cat $D/synthetic/truth.json              the counts the reads were made from

2. Sort and index the reads ExpansionHunter used (the BAMlet: synthetic_realigned.bam is not sorted):

  samtools sort -o synthetic.sorted.bam synthetic_realigned.bam && samtools index synthetic.sorted.bam

3. Draw them – a picture for each locus, and the allele depths and phasing:

  REViewer --reads synthetic.sorted.bam --vcf synthetic.vcf --reference $D/synthetic/reference.fa \
      --catalog $D/synthetic/catalog.json --locus EXPANDED_CAG --output-prefix synthetic
  firefox synthetic.EXPANDED_CAG.svg       (or double-click it in the file manager)
  cat synthetic.metrics.tsv synthetic.phasing.tsv
  (--locus NORMAL_CAG,EXPANDED_CAG,X_CAG draws all three)

The reads in their alignments to the reference – the long allele's extra CAGs as insertions, and clipped reads –
are in IGV:

  igv -g $D/synthetic/reference.fa $D/synthetic/reads.bam chr2:3900-4150

(The BAMlet's reads carry their alignments to ExpansionHunter's repeat graph in tags, for REViewer: IGV shows them
as unmapped.)

REViewer's own example – BEAN1, 17 and 17 TGGAA units:

  REViewer --reads $D/reviewer_example/BEAN1_HG00684.bam --vcf $D/reviewer_example/HG00684.vcf \
      --reference $D/reviewer_example/reference.fa.gz --catalog $D/reviewer_example/catalog.json \
      --locus BEAN1 --output-prefix HG00684
  firefox HG00684.BEAN1.svg

ExpansionHunter's own example – an SNV and a repeat in one locus (REViewer 0.2.7 cannot draw such a locus):

  ExpansionHunter --reads $D/expansionhunter_example/variants.bam --reference $D/expansionhunter_example/reference.fa \
      --variant-catalog $D/expansionhunter_example/variants.json --output-prefix example
  grep -v '^##' example.vcf; grep -v '^##' $D/expansionhunter_example/expected.vcf

As a job on the HPC (from your folder there):  bsub < $D/run_expansionhunter.sh
