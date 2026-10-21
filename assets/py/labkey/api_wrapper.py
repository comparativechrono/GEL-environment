"""APIWrapper: the entry point of the labkey client (version 2.x)."""
from labkey.query import QueryWrapper
from labkey.server_context import ServerContext


class APIWrapper:
    """APIWrapper(domain, container_path, context_path="labkey", use_ssl=True)

    api.query.select_rows(...) and api.query.execute_sql(...) query the data browser's tables.
    """

    def __init__(self, domain, container_path, context_path=None, use_ssl=True, verify_ssl=True, api_key=None,
                 disable_csrf=False, allow_redirects=False):
        self.server_context = ServerContext(domain=domain, container_path=container_path, context_path=context_path,
                                            use_ssl=use_ssl, verify_ssl=verify_ssl, api_key=api_key,
                                            disable_csrf=disable_csrf, allow_redirects=allow_redirects)
        self.query = QueryWrapper(self.server_context)

    def __repr__(self):
        return f"<APIWrapper {self.server_context!r}>"
