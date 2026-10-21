# Query the LabKey tables with SQL from R.
# Before the first use: configure ~/.netrc (see ~/gel_data_resources/example_config_files).

library(tidyverse)
library(Rlabkey)
library(readr)

labkey.setWafEncoding(FALSE)

query_to_df <- function(sql_query, database) {
  labkey.setDefaults(baseUrl = "https://labkey.prod.aws.gel.ac/labkey/")
  labkey.executeSql(folderPath = database,
                    schemaName = "lists",
                    colNameOpt = "rname",
                    sql = sql_query) %>%
    mutate(across(everything(), as.character))
}

database <- "/main-programme/main-programme_v19_2024-10-31"

sql <- "SELECT p.participant_id, p.programme, p.year_of_birth, sr.delivery_date
        FROM participant p
        JOIN sequencing_report sr ON p.participant_id = sr.participant_id
        WHERE p.programme_consent_status = 'Consenting'"

participants <- query_to_df(sql, database)
head(participants)
table(participants$programme)
