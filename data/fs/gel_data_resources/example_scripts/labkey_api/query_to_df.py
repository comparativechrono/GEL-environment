# Query the LabKey tables with SQL from Python.
# Before the first use: configure ~/.netrc (see ~/gel_data_resources/example_config_files).
import labkey
import pandas as pd
from labkey.api_wrapper import APIWrapper


def query_to_df(sql_query, database):
    api = APIWrapper(domain="labkey.prod.aws.gel.ac", container_path=database,
                     context_path="labkey", use_ssl=True)
    results = api.query.execute_sql(sql=sql_query, schema_name="lists",
                                    max_rows=100000000, waf_encode_sql=False)
    return pd.DataFrame(results["rows"])


database = "/main-programme/main-programme_v19_2024-10-31"
sql = """
SELECT participant_id, programme, year_of_birth, participant_phenotypic_sex
FROM participant
WHERE programme_consent_status = 'Consenting'
"""
df = query_to_df(sql, database)
print(df.head())
print(df["programme"].value_counts())
