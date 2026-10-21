"""Exceptions raised by the LabKey client (the names of the real client's exceptions)."""


class RequestError(Exception):
    """A request to the server failed."""

    def __init__(self, server_response=None, message=None, status_code=None):
        self.status_code = status_code
        self.server_response = server_response
        self.message = message or "Request failed"
        super().__init__(f"'{status_code}: {self.message}'" if status_code else self.message)


class RequestAuthorizationError(RequestError):
    """The server refused the request: the credentials (~/.netrc) are missing or wrong."""


class QueryNotFoundError(RequestError):
    """The schema, query or folder does not exist."""


class ServerNotFoundError(RequestError):
    """The server name (domain) could not be found."""


class ServerContextError(RequestError):
    """The server context is not valid."""


class UnexpectedRedirectError(RequestError):
    """The server answered with a redirect (usually to its sign-in page)."""
