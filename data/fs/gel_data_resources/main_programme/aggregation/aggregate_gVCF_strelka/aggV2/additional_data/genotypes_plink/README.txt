aggV2 common-variant extract (PLINK 1 binary)
=============================================

aggV2_common_variants_extract.bed/.bim/.fam

Genotypes of every main programme germline genome (rare disease participants,
their relatives and cancer participants) at a set of common and low-frequency
SNPs on the autosomes and chromosome X, extracted from aggV2 (GRCh38).

  .fam   FID and IID are the plate keys (platekey in LabKey tables such as
         aggregate_gvcf_sample_stats, plated_sample and sequencing_report);
         sex is the participant's recorded sex (1 = male, 2 = female);
         the phenotype column is missing (-9).
  .bim   variant IDs are chr:pos:ref:alt; the counted allele (A1, column 5) is
         the ALT allele.

No sample or variant QC has been applied: missing calls, SNPs out of
Hardy-Weinberg equilibrium, sequencing-batch differences, related and
duplicated samples are all still present.

Principal components, ancestry and relatedness for the same genomes:
  ../PCs_relatedness/aggV2_PCs_ancestry_relatedness.tsv
  ../PCs_relatedness/relatedness/   (PLINK 2 KING-robust, cut-off 0.0442)
