"""Where requests go: the server (domain), its context path and the folder (container path)."""


class ServerContext:
    def __init__(self, domain, container_path, context_path=None, use_ssl=True, verify_ssl=True, api_key=None,
                 disable_csrf=False, allow_redirects=False, **kwargs):
        self._domain = domain
        self._container_path = container_path
        self._context_path = context_path
        self._use_ssl = use_ssl
        self._verify_ssl = verify_ssl
        self._api_key = api_key
        self.allow_redirects = allow_redirects
        self.hostname = ("https" if use_ssl else "http") + "://" + str(domain) + ("/" + str(context_path).strip("/") if context_path else "")

    def __repr__(self):
        return f"<ServerContext [ {self._domain} | {self._context_path} | {self._container_path} ]>"

    @property
    def domain(self):
        return self._domain

    @property
    def container_path(self):
        return self._container_path

    @property
    def context_path(self):
        return self._context_path

    def build_url(self, controller, action, container_path=None):
        cp = (container_path if container_path is not None else self._container_path) or ""
        return f"{self.hostname}/{controller}/{str(cp).strip('/')}/{action}"
