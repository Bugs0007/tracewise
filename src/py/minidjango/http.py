"""Requests, responses, URL routing and the request/response pipeline."""
import json
import re

from .exceptions import Http404, NotAuthenticated, PermissionDenied, ValidationError


class AnonymousUser:
    is_authenticated = False
    is_anonymous = True
    id = None
    pk = None
    username = ""

    def __repr__(self):
        return "AnonymousUser"


class HttpRequest:
    def __init__(self, method="GET", path="/", GET=None, data=None, headers=None, COOKIES=None):
        self.method = method.upper()
        self.path = path if path.startswith("/") else "/" + path
        self.GET = dict(GET or {})
        self.data = data if data is not None else {}
        self.POST = self.data if isinstance(self.data, dict) else {}
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}
        self.COOKIES = dict(COOKIES or {})
        self.user = AnonymousUser()
        self.session = {}
        self.META = {}
        self.trace = []  # filled by the pipeline: what happened, in order

    @property
    def body(self):
        return json.dumps(self.data)

    def __repr__(self):
        return f"<HttpRequest {self.method} {self.path}>"


class HttpResponse:
    def __init__(self, content="", status=200, headers=None, content_type="text/plain"):
        self.content = content
        self.status_code = status
        self.headers = {k.lower(): v for k, v in (headers or {}).items()}
        self.headers.setdefault("content-type", content_type)
        self.cookies = {}

    def __getitem__(self, k):
        return self.headers[k.lower()]

    def __setitem__(self, k, v):
        self.headers[k.lower()] = v

    def set_cookie(self, key, value):
        self.cookies[key] = value

    def json(self):
        return json.loads(self.content) if isinstance(self.content, str) and self.content else self.content

    def __repr__(self):
        return f"<{type(self).__name__} status={self.status_code}>"


class JsonResponse(HttpResponse):
    def __init__(self, data, status=200, headers=None, safe=True):
        if safe and not isinstance(data, dict):
            raise TypeError("In order to allow non-dict objects to be serialized set the safe parameter to False.")
        super().__init__(json.dumps(data, default=str), status=status, headers=headers, content_type="application/json")
        self.data = data


class HttpResponseNotAllowed(JsonResponse):
    def __init__(self, permitted):
        super().__init__({"detail": "Method not allowed"}, status=405, headers={"Allow": ", ".join(permitted)})


# ───────────────────────────── routing ─────────────────────────────

_CONVERTERS = {"int": (r"[0-9]+", int), "str": (r"[^/]+", str), "slug": (r"[-a-zA-Z0-9_]+", str), "path": (r".+", str), "uuid": (r"[0-9a-f-]{36}", str)}


class URLPattern:
    def __init__(self, route, view, name=None):
        self.route = route
        self.view = view
        self.name = name
        self.casts = {}

        def repl(m):
            conv, key = (m.group(1) or "str"), m.group(2)
            rx, cast = _CONVERTERS[conv]
            self.casts[key] = cast
            return f"(?P<{key}>{rx})"

        self.regex = re.compile("^/?" + re.sub(r"<(?:(\w+):)?(\w+)>", repl, route.lstrip("/")) + "$")

    def match(self, path):
        m = self.regex.match(path)
        if not m:
            return None
        return {k: self.casts[k](v) for k, v in m.groupdict().items()}

    def __repr__(self):
        return f"<URLPattern '{self.route}'>"


def path(route, view, name=None):
    return URLPattern(route, view, name)


def resolve(urlpatterns, p):
    for pat in urlpatterns:
        kwargs = pat.match(p)
        if kwargs is not None:
            return pat, kwargs
    raise Http404(f"No URL matches '{p}'")


def reverse(urlpatterns, name, kwargs=None):
    for pat in urlpatterns:
        if pat.name == name:
            out = pat.route
            for k, v in (kwargs or {}).items():
                out = re.sub(r"<(?:\w+:)?" + k + ">", str(v), out)
            return "/" + out.lstrip("/")
    raise KeyError(f"Reverse for '{name}' not found")


# ───────────────────────────── the pipeline ─────────────────────────────


def error_response(exc):
    if isinstance(exc, Http404):
        return JsonResponse({"detail": str(exc) or "Not found."}, status=404)
    if isinstance(exc, NotAuthenticated):
        return JsonResponse({"detail": str(exc) or "Authentication credentials were not provided."}, status=401)
    if isinstance(exc, PermissionDenied):
        return JsonResponse({"detail": str(exc) or "You do not have permission to perform this action."}, status=403)
    if isinstance(exc, ValidationError):
        d = exc.detail
        return JsonResponse(d if isinstance(d, dict) else {"detail": d}, status=400)
    from .models import ObjectDoesNotExist

    if isinstance(exc, ObjectDoesNotExist):
        return JsonResponse({"detail": "Not found."}, status=404)
    return JsonResponse({"detail": f"Server error: {type(exc).__name__}: {exc}"}, status=500)


class App:
    """A Django-style project: URL patterns + an ordered middleware list.

    Middleware are factories in Django's style::

        def timing(get_response):
            def middleware(request):
                ...                       # runs on the way in, in list order
                response = get_response(request)
                ...                       # runs on the way out, in reverse order
                return response
            return middleware
    """

    def __init__(self, urlpatterns, middleware=()):
        self.urlpatterns = list(urlpatterns)
        self.middleware = list(middleware)
        handler = self._get_response
        for mw in reversed(self.middleware):
            handler = _traced(mw, handler)
        self._handler = handler

    def _get_response(self, request):
        try:
            pat, kwargs = resolve(self.urlpatterns, request.path)
            request.trace.append(f"router: {request.path} -> {getattr(pat.view, '__name__', 'view')}")
            response = pat.view(request, **kwargs)
            request.trace.append(f"view: returned {getattr(response, 'status_code', '?')}")
        except Exception as exc:  # noqa: BLE001 - convert to an HTTP error like Django does
            request.trace.append(f"error: {type(exc).__name__}")
            response = error_response(exc)
        if not isinstance(response, HttpResponse):
            raise TypeError(f"The view didn't return an HttpResponse object. It returned {type(response).__name__} instead.")
        return response

    def handle(self, request):
        try:
            return self._handler(request)
        except Exception as exc:  # noqa: BLE001 - middleware errors become responses too
            return error_response(exc)

    __call__ = handle


def _traced(factory, inner):
    name = getattr(factory, "__name__", "middleware")
    mw = factory(inner)

    def wrapper(request):
        request.trace.append(f"{name}: request in")
        response = mw(request)
        request.trace.append(f"{name}: response out")
        return response

    return wrapper


# ───────────────────────────── view helpers ─────────────────────────────


def require_http_methods(methods):
    allowed = [m.upper() for m in methods]

    def deco(view):
        def wrapper(request, *a, **kw):
            if request.method not in allowed:
                return HttpResponseNotAllowed(allowed)
            return view(request, *a, **kw)

        wrapper.__name__ = getattr(view, "__name__", "view")
        return wrapper

    return deco


require_GET = require_http_methods(["GET"])
require_POST = require_http_methods(["POST"])


class View:
    """Class-based view: dispatches to get/post/put/patch/delete methods."""

    http_method_names = ["get", "post", "put", "patch", "delete"]

    @classmethod
    def as_view(cls, **initkwargs):
        def view(request, *args, **kwargs):
            self = cls(**initkwargs)
            self.request = request
            return self.dispatch(request, *args, **kwargs)

        view.__name__ = cls.__name__
        return view

    def dispatch(self, request, *args, **kwargs):
        handler = getattr(self, request.method.lower(), None)
        if request.method.lower() not in self.http_method_names or handler is None:
            return HttpResponseNotAllowed([m.upper() for m in self.http_method_names if hasattr(self, m)])
        return handler(request, *args, **kwargs)


def get_object_or_404(model, **kw):
    try:
        return model.objects.get(**kw)
    except model.DoesNotExist:
        raise Http404(f"No {model.__name__} matches the given query.")
