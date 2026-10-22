#!/bin/bash
#BSUB -q short
#BSUB -P re_gecip_training
#BSUB -J relatedness
#BSUB -o relatedness.%J.out
#BSUB -e relatedness.%J.err
#BSUB -R "rusage[mem=2000]"
#
# Kinship (PLINK 2's KING-robust) and a list of unrelated samples, on the synthetic cohort of this folder (README.txt),
# with the file names Genomics England gave its own results for aggV3.
# Submit it from your own folder on the HPC – the results are written there:
#   cd /re_gecip/training/$USER/relatedness
#   bsub < /gel_data_resources/example_scripts/workshop_scripts/relatedness/run_relatedness.sh

module load plink2/2.0.0-b.1-dev

D=/gel_data_resources/example_scripts/workshop_scripts/relatedness

# the pairs at kinship 0.0442 or more (third degree or closer)
plink2 --bfile $D/cohort --make-king-table --king-table-filter 0.0442 --out make_king_table

# unrelated (.king.cutoff.in.id) and related (.king.cutoff.out.id) samples
plink2 --bfile $D/cohort --king-cutoff 0.0442 --out assign_relatedness

cat make_king_table.kin0
cat assign_relatedness.king.cutoff.out.id
