"""Querying the data browser: QueryFilter, select_rows, execute_sql (and QueryWrapper, used by APIWrapper)."""
from labkey import _simulator


class QueryFilter:
    """A filter for select_rows: QueryFilter(column, value, filter_type).

    filter_type is one of QueryFilter.Types (default: EQUAL). For IN filters give a list of values,
    or the values separated by semicolons.
    """

    class Types:
        HAS_ANY_VALUE = ""

        EQUAL = "eq"
        DATE_EQUAL = "dateeq"

        NEQ = "neq"
        NOT_EQUAL = "neq"
        DATE_NOT_EQUAL = "dateneq"

        NEQ_OR_NULL = "neqornull"
        NOT_EQUAL_OR_MISSING = "neqornull"

        GT = "gt"
        GREATER_THAN = "gt"
        DATE_GREATER_THAN = "dategt"

        LT = "lt"
        LESS_THAN = "lt"
        DATE_LESS_THAN = "datelt"

        GTE = "gte"
        GREATER_THAN_OR_EQUAL = "gte"
        DATE_GREATER_THAN_OR_EQUAL = "dategte"

        LTE = "lte"
        LESS_THAN_OR_EQUAL = "lte"
        DATE_LESS_THAN_OR_EQUAL = "datelte"

        STARTS_WITH = "startswith"
        DOES_NOT_START_WITH = "doesnotstartwith"

        CONTAINS = "contains"
        DOES_NOT_CONTAIN = "doesnotcontain"

        CONTAINS_ONE_OF = "containsoneof"
        CONTAINS_NONE_OF = "containsnoneof"

        IN = "in"
        EQUALS_ONE_OF = "in"

        NOT_IN = "notin"
        EQUALS_NONE_OF = "notin"

        BETWEEN = "between"
        NOT_BETWEEN = "notbetween"

        IS_BLANK = "isblank"
        IS_NOT_BLANK = "isnonblank"
        MISSING = "isblank"
        NOT_MISSING = "isnonblank"

    def __init__(self, column, value, filter_type=Types.EQUAL):
        self.column_name = column
        self.value = value
        self.filter_type = filter_type

    def get_url_parameter_name(self):
        return "query." + str(self.column_name) + "~" + str(self.filter_type)

    def get_url_parameter_value(self):
        if isinstance(self.value, (list, tuple, set)):
            return ";".join(str(v) for v in self.value)
        return self.value

    def get_column_name(self):
        return self.column_name

    def __repr__(self):
        return f"<QueryFilter [{self.column_name} {self.filter_type} {self.value}]>"


def select_rows(server_context, schema_name, query_name, view_name=None, filter_array=None, container_path=None,
                columns=None, max_rows=-1, sort=None, offset=None, container_filter=None, parameters=None,
                show_rows=None, include_total_count=None, include_details_column=None, include_update_column=None,
                selection_key=None, required_version=None, timeout=300, ignore_filter=None):
    """Rows of a table (a query of the schema "lists"): a dict with "rows", "rowCount", "metaData" ..."""
    return _simulator.select_rows(server_context, schema_name, query_name, view_name=view_name, filter_array=filter_array,
                                  container_path=container_path, columns=columns, max_rows=max_rows, sort=sort,
                                  offset=offset)


def execute_sql(server_context, schema_name, sql, container_path=None, max_rows=None, sort=None, timeout=300,
                container_filter=None, save_in_session=None, parameters=None, required_version=None,
                waf_encode_sql=True):
    """Run LabKey SQL in the schema "lists": a dict with "rows", "rowCount", "metaData" ..."""
    return _simulator.execute_sql(server_context, schema_name, sql, container_path=container_path, max_rows=max_rows,
                                  sort=sort)


def insert_rows(server_context, schema_name, query_name, rows, container_path=None, timeout=300, **kwargs):
    _simulator.resolve(server_context, container_path)
    from labkey.exceptions import RequestAuthorizationError
    raise RequestAuthorizationError(message="User does not have permission to perform this operation.", status_code=403)


update_rows = delete_rows = truncate_table = insert_rows


class QueryWrapper:
    """api.query of an APIWrapper: the same functions, with the server context filled in."""

    def __init__(self, server_context):
        self.server_context = server_context

    def select_rows(self, schema_name, query_name, view_name=None, filter_array=None, container_path=None, columns=None,
                    max_rows=-1, sort=None, offset=None, container_filter=None, parameters=None, show_rows=None,
                    include_total_count=None, include_details_column=None, include_update_column=None,
                    selection_key=None, required_version=None, timeout=300, ignore_filter=None):
        return select_rows(self.server_context, schema_name, query_name, view_name=view_name, filter_array=filter_array,
                           container_path=container_path, columns=columns, max_rows=max_rows, sort=sort, offset=offset)

    def execute_sql(self, schema_name, sql, container_path=None, max_rows=None, sort=None, timeout=300,
                    container_filter=None, save_in_session=None, parameters=None, required_version=None,
                    waf_encode_sql=True):
        return execute_sql(self.server_context, schema_name, sql, container_path=container_path, max_rows=max_rows,
                           sort=sort)

    def insert_rows(self, schema_name, query_name, rows, container_path=None, timeout=300, **kwargs):
        return insert_rows(self.server_context, schema_name, query_name, rows, container_path=container_path)

    update_rows = delete_rows = truncate_table = insert_rows
