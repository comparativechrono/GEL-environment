Relatedness – kinship with PLINK 2 (KING-robust) on a small synthetic cohort
===========================================================================

Training simulator: the genotypes here are synthetic – no real person. They come from the genomics-wasm project
(https://github.com/comparativechrono/genomics-wasm, datasets/king/, MIT licence), which made them to check its builds:
104 of its 105 samples, 32,809 SNPs on chromosomes 1 to 4. The folder is read-only: write your results into your own
folder.

  cohort.bed, .bim, .fam   the genotypes (PLINK 1 binary files). The .fam declares one family, FAM: DAD, MOM and
                           their children CHILD1 and CHILD2. Every other sample is a family of its own: DUP (family
                           COPY) and U01 … U99
  truth.txt                how the samples are really related: look at it after step 2
  run_relatedness.sh       steps 2 and 4 as a job for the HPC (LSF)

Genomics England computed the relatedness of its aggregated genomes (aggV2, aggV3) the same way: PLINK 2's KING-robust
kinship for every pair, a table of the pairs at 0.0442 or more (third degree or closer), and --king-cutoff 0.0442 for a
list of unrelated participants. In the Research Environment, aggV2's are in
/gel_data_resources/main_programme/aggregation/aggregate_gVCF_strelka/aggV2/additional_data/PCs_relatedness/relatedness
(not in this simulator).

  module load plink2/2.0.0-b.1-dev
  D=/gel_data_resources/example_scripts/workshop_scripts/relatedness
  mkdir -p /re_gecip/training/$USER/relatedness && cd /re_gecip/training/$USER/relatedness

1. The kinship of every pair of samples – 104 samples, 5,356 pairs:

  plink2 --bfile $D/cohort --make-king-table --out cohort
  head -3 cohort.kin0
      NSNP     the SNPs where both samples have a genotype
      HETHET   the share of them where both are heterozygous
      IBS0     the share where they have no allele in common (one is AA, the other aa)
      KINSHIP  the KING-robust kinship coefficient
  sort -k8,8gr cohort.kin0 | head          the most related pairs first

2. Only the related pairs – third degree or closer – and what they are:

  plink2 --bfile $D/cohort --make-king-table --king-table-filter 0.0442 --out related
  awk 'NR > 1 { k = $8; d = k > 0.354 ? "duplicate or identical twin" : k > 0.177 ? "1st degree" : k > 0.0884 ? "2nd degree" : "3rd degree"; print $2, $4, k, $7, d }' related.kin0

      kinship  above 0.354      the same genome: a sample twice, or identical twins (0.5)
               0.177 - 0.354    first degree: parent and child, or full siblings (0.25)
               0.0884 - 0.177   second degree: grandparent, aunt or uncle, half sibling (0.125)
               0.0442 - 0.0884  third degree: first cousins (0.0625)
      IBS0 tells the first degree apart. A child has one allele from each parent, so a parent and child always share
      an allele: their IBS0 is about 0. Full siblings can inherit different alleles: their IBS0 is above 0.

  Which pairs are parents and children, which are siblings? Is a pair related that the .fam does not declare?
  cat $D/truth.txt

3. Check the pedigree – only the pairs within each family of the .fam (FID):

  plink2 --bfile $D/cohort --make-king-table rel-check --out within
  cat within.kin0                          DAD and MOM: kinship about 0, as the founders of a pedigree should be

4. A list of unrelated samples, as Genomics England made for aggV2, with the cutoff 0.0442:

  plink2 --bfile $D/cohort --king-cutoff 0.0442 --out unrelated
  cat unrelated.king.cutoff.out.id         the samples left out, so that no two of the rest are related
  wc -l unrelated.king.cutoff.in.id        the samples kept (and a header line)
  awk 'NR == FNR { keep[$2]; next } FNR > 1 && ($2 in keep) && ($4 in keep) && $8 >= 0.0442' unrelated.king.cutoff.in.id cohort.kin0 | wc -l
                                           the related pairs among the samples kept: 0
  Analyses that assume unrelated people, such as association tests, keep only these: --keep unrelated.king.cutoff.in.id

As a job on the HPC (from your folder there):  bsub < $D/run_relatedness.sh

The 105th sample of genomics-wasm's cohort, U100, is left out because this build of PLINK 2 has a fault: with an odd
number of samples, its KING-robust values for the pairs of the first sample are wrong. The terminal says so when that
happens (man plink2).
