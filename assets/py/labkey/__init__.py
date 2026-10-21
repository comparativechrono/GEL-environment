"""LabKey client for Python (Research Environment training simulator stand-in).

The commonly used parts of the labkey package (version 2.x):

    from labkey.api_wrapper import APIWrapper
    from labkey.query import QueryFilter
    api = APIWrapper(domain, container_path, context_path="labkey", use_ssl=True)
    api.query.select_rows(schema_name, query_name, filter_array=[QueryFilter(col, value, "eq")])
    api.query.execute_sql(schema_name, sql)

and the older module functions labkey.utils.create_server_context(), labkey.query.select_rows(ctx, ...),
labkey.query.execute_sql(ctx, ...). Results come from the simulator's copy of the data browser's tables.
"""
__title__ = "labkey"
__version__ = "2.4.0"
__author__ = "Research Environment training simulator"
__license__ = "Apache License 2.0"

from labkey import query, utils, exceptions  # noqa: E402,F401
from labkey import api_wrapper  # noqa: E402,F401
