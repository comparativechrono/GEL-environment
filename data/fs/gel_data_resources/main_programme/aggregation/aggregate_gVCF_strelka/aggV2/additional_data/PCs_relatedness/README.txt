aggV2 principal components, ancestry and relatedness
===================================================

aggV2_PCs_ancestry_relatedness.tsv
  participant_id, platekey  the genome
  PC1 .. PC20               principal components computed on unrelated genomes
                            (one per pair closer than third degree removed),
                            relatives projected onto them
  pred_EUR .. pred_AMR      probability of each 1000 Genomes superpopulation
  ancestry0_8               the superpopulation with probability above 0.8
                            (NA when none reaches it)
  unrelated_set             1 = in the maximal set of unrelated genomes

relatedness/  PLINK 2 KING-robust kinship on high-quality common autosomal SNPs
  make_king_table.kin0                         pairs with kinship >= 0.0442
  assign_relatedness.king.cutoff.in.id/.out.id  the unrelated set (--king-cutoff 0.0442)

Kinship of about 0.5 means duplicate samples (or monozygotic twins),
0.25 first-degree relatives, 0.125 second-degree, 0.0625 third-degree.
