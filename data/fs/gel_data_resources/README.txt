gel_data_resources  (read-only)
===================

Outputs of the Genomics England bioinformatics pipelines and other resources,
mounted on the desktop (~/gel_data_resources) and the HPC (/gel_data_resources).

  main_programme/        100,000 Genomes Project datasets (by type, then date)
  gms/                   NHS Genomic Medicine Service datasets
  pilot/                 pilot programme datasets
  example_config_files/  configuration templates for R, Python and the LabKey API
  example_scripts/       example scripts (LabKey API queries, workshops)
  workflows/             pipelines provided for researchers

This folder is read-only. Writing here gives "Permission denied": to unpack a
file, write the output elsewhere, e.g.  gunzip -c file.gz > ~/re_gecip/.../file

[Training simulator: the large datasets are not included. Practicals add the
files they need.]
