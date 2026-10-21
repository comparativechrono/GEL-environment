# Fetch a whole table, or part of one, with labkey.selectRows.
library(Rlabkey)
labkey.setDefaults(baseUrl = "https://labkey.prod.aws.gel.ac/labkey/")

participant <- labkey.selectRows(
  schemaName = "lists",
  colNameOpt = "rname",
  maxRows = 100000000,
  folderPath = "/main-programme/main-programme_v19_2024-10-31",
  queryName = "participant",
  colFilter = makeFilter(c("participant_type", "EQUAL", "Proband"),
                         c("year_of_birth", "BETWEEN", "1950,2010")),
  colSelect = c("participant_id", "rare_diseases_family_id", "year_of_birth"),
  colSort = "+year_of_birth"
)
nrow(participant)
