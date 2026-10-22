#!/bin/bash
#BSUB -q short
#BSUB -P re_gecip_training
#BSUB -J expansionhunter
#BSUB -o expansionhunter.%J.out
#BSUB -e expansionhunter.%J.err
#BSUB -R "rusage[mem=2000]"
#
# ExpansionHunter, samtools and REViewer on the synthetic sample of this folder (see README.txt).
# Submit it from your own folder on the HPC – the results are written there:
#   cd /re_gecip/training/$USER/repeats
#   bsub < /gel_data_resources/example_scripts/workshop_scripts/repeat_expansions/run_expansionhunter.sh

module load ExpansionHunter/5.0.0 samtools/1.21 REViewer/0.2.7

D=/gel_data_resources/example_scripts/workshop_scripts/repeat_expansions/synthetic

ExpansionHunter --reads $D/reads.bam --reference $D/reference.fa \
    --variant-catalog $D/catalog.json --sex male --output-prefix synthetic

samtools sort -o synthetic.sorted.bam synthetic_realigned.bam
samtools index synthetic.sorted.bam

REViewer --reads synthetic.sorted.bam --vcf synthetic.vcf --reference $D/reference.fa \
    --catalog $D/catalog.json --locus NORMAL_CAG,EXPANDED_CAG,X_CAG --output-prefix synthetic

grep -v '^##' synthetic.vcf | cut -f1,2,5,10
cat synthetic.metrics.tsv
