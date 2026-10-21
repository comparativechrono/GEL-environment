# R configuration for the Research Environment.
# In the real RE these lines point R at Genomics England's internal CRAN and
# Bioconductor mirrors (an Artifactory server). The training simulator keeps
# R's own repository settings so that install.packages() still works here.
myrepo = getOption("repos")
# myrepo["CRAN"] = "https://artifactory.aws.gel.ac/artifactory/cran"      # (real RE)
options(repos = myrepo)
rm(myrepo)
