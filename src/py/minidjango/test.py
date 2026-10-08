"""Test client: call an App like a browser would, without a network."""
from .http import HttpRequest


class Client:
    def __init__(self, app, headers=None):
        self.app = app
        self.cookies = {}
        self.headers = dict(headers or {})
        self.last_request = None

    def request(self, method, path, data=None, headers=None):
        p, _, qs = path.partition("?")
        get = dict(pair.split("=", 1) for pair in qs.split("&") if "=" in pair) if qs else {}
        if method == "GET" and isinstance(data, dict):
            get.update({k: str(v) for k, v in data.items()})
            data = None
        req = HttpRequest(method, p, GET=get, data=data, headers={**self.headers, **(headers or {})}, COOKIES=self.cookies)
        self.last_request = req
        resp = self.app.handle(req)
        self.cookies.update(getattr(resp, "cookies", {}))
        return resp

    def get(self, path, data=None, headers=None):
        return self.request("GET", path, data, headers)

    def post(self, path, data=None, headers=None):
        return self.request("POST", path, data, headers)

    def put(self, path, data=None, headers=None):
        return self.request("PUT", path, data, headers)

    def patch(self, path, data=None, headers=None):
        return self.request("PATCH", path, data, headers)

    def delete(self, path, headers=None):
        return self.request("DELETE", path, None, headers)
