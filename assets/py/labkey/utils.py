"""Helpers of the LabKey client (the older, module-level API)."""
from labkey.server_context import ServerContext


def create_server_context(domain, container_path, context_path=None, use_ssl=True, verify_ssl=True, api_key=None,
                          disable_csrf=False):
    """Create a server context (labkey 1.x style): pass it to labkey.query.select_rows / execute_sql."""
    return ServerContext(domain=domain, container_path=container_path, context_path=context_path, use_ssl=use_ssl,
                         verify_ssl=verify_ssl, api_key=api_key, disable_csrf=disable_csrf)


def waf_encode(value):
    """The real client base64-encodes SQL for the web application firewall; nothing to do here."""
    return value
