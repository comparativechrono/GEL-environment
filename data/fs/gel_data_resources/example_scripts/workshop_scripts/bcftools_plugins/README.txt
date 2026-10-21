bcftools plugins – a small synthetic example
============================================

Training simulator: these files are synthetic. They describe no real person: a
made-up family (child, father, mother) and an unrelated sample, on a made-up
1,000-base chromosome "chr1". They come from the genomics-wasm project
(https://github.com/comparativechrono/genomics-wasm, datasets/hts/common/, MIT
licence), which uses them to check its builds of bcftools.

  trio-csq.vcf   12 variants of four samples, with VEP-style annotations in the
                 CSQ field (Allele|Consequence|IMPACT|SYMBOL|Gene|Feature|...),
                 missing, haploid and multiallelic genotypes, and Mendelian errors
  phased.vcf     the same samples, with phased genotypes
  family.ped     the pedigree of the trio

Try (module load bcftools/1.21 first; the folder is read-only, so write any
output into your own folder):

  D=/gel_data_resources/example_scripts/workshop_scripts/bcftools_plugins
  bcftools +split-vep $D/trio-csq.vcf -l
  bcftools +split-vep $D/trio-csq.vcf -d -f '%CHROM\t%POS\t%Consequence\t%SYMBOL\n'
  bcftools +fill-tags $D/trio-csq.vcf -Ov -o ~/filled.vcf -- -t AN,AC,AF
  bcftools +mendelian2 $D/trio-csq.vcf -P $D/family.ped -m c
  bcftools +trio-switch-rate $D/phased.vcf -- -p $D/family.ped

With bcftools/1.16 the Mendelian plugin is the older one:
  bcftools +mendelian $D/trio-csq.vcf -p $D/family.ped -m c
