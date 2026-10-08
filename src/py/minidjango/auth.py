"""Authentication helpers: password hashing, users, sessions, tokens, JWT."""
import base64
import hashlib
import hmac
import json
import secrets as _secrets

from . import models
from .exceptions import NotAuthenticated
from .http import AnonymousUser, JsonResponse

# ───────────────────────── password hashing ─────────────────────────


def _pbkdf2_sha256(password, salt, iterations):
    """PBKDF2-HMAC-SHA256 (one 32-byte block), written out so it also runs where OpenSSL is absent (Pyodide)."""
    u = hmac.new(password, salt + b"\x00\x00\x00\x01", hashlib.sha256).digest()
    out = bytearray(u)
    for _ in range(iterations - 1):
        u = hmac.new(password, u, hashlib.sha256).digest()
        for i, b in enumerate(u):
            out[i] ^= b
    return bytes(out)


def make_password(raw, salt=None, iterations=1000):
    """PBKDF2-SHA256 with a per-user random salt: 'pbkdf2_sha256$iterations$salt$hash'."""
    salt = salt or _secrets.token_hex(8)
    dk = _pbkdf2_sha256(raw.encode(), salt.encode(), iterations)
    return f"pbkdf2_sha256${iterations}${salt}${base64.b64encode(dk).decode()}"


def check_password(raw, encoded):
    try:
        algo, iterations, salt, _ = encoded.split("$", 3)
    except (ValueError, AttributeError):
        return False
    if algo != "pbkdf2_sha256":
        return False
    # constant-time comparison avoids leaking how many characters matched
    return hmac.compare_digest(make_password(raw, salt, int(iterations)), encoded)


# ───────────────────────── users ─────────────────────────


class User(models.Model):
    username = models.CharField(max_length=150, unique=True)
    password = models.CharField(max_length=128, default="")
    email = models.EmailField(max_length=254, default="")
    is_active = models.BooleanField(default=True)
    is_staff = models.BooleanField(default=False)

    is_authenticated = True
    is_anonymous = False

    def set_password(self, raw):
        self.password = make_password(raw)

    def check_password(self, raw):
        return check_password(raw, self.password)

    def __str__(self):
        return self.username


def create_user(username, password, **extra):
    u = User(username=username, **extra)
    u.set_password(password)
    return u.save()


def authenticate(username, password):
    try:
        u = User.objects.get(username=username)
    except User.DoesNotExist:
        return None
    return u if u.is_active and u.check_password(password) else None


# ───────────────────────── sessions ─────────────────────────

SESSIONS = {}  # session key -> dict


def login(request, user):
    key = _secrets.token_hex(16)
    SESSIONS[key] = {"_auth_user_id": user.pk}
    request.session = SESSIONS[key]
    request.session_key = key
    request.user = user
    return key


def logout(request):
    key = getattr(request, "session_key", None) or request.COOKIES.get("sessionid")
    SESSIONS.pop(key, None)
    request.session = {}
    request.user = AnonymousUser()


def SessionMiddleware(get_response):
    def middleware(request):
        key = request.COOKIES.get("sessionid")
        request.session_key = key if key in SESSIONS else None
        request.session = SESSIONS.get(key, {})
        response = get_response(request)
        new_key = getattr(request, "session_key", None)
        if new_key and new_key != key:
            response.set_cookie("sessionid", new_key)
        return response

    return middleware


def AuthenticationMiddleware(get_response):
    def middleware(request):
        uid = request.session.get("_auth_user_id")
        request.user = User.objects.get(pk=uid) if uid else AnonymousUser()
        return get_response(request)

    return middleware


# ───────────────────────── tokens ─────────────────────────

TOKENS = {}  # key -> user id


def create_token(user):
    key = _secrets.token_hex(20)
    TOKENS[key] = user.pk
    return key


def TokenAuthMiddleware(get_response):
    """Reads `Authorization: Token <key>`; leaves request.user anonymous if absent/invalid."""

    def middleware(request):
        auth = request.headers.get("authorization", "")
        if auth.startswith("Token "):
            uid = TOKENS.get(auth[6:].strip())
            if uid:
                request.user = User.objects.get(pk=uid)
        return get_response(request)

    return middleware


# ───────────────────────── JWT (HS256) ─────────────────────────


def _b64(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _unb64(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


class InvalidToken(Exception):
    pass


def jwt_encode(payload, secret):
    header = _b64(json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode())
    body = _b64(json.dumps(payload, separators=(",", ":"), sort_keys=True).encode())
    sig = _b64(hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    return f"{header}.{body}.{sig}"


def jwt_decode(token, secret, now=None):
    try:
        header, body, sig = token.split(".")
    except (ValueError, AttributeError):
        raise InvalidToken("Malformed token")
    expected = _b64(hmac.new(secret.encode(), f"{header}.{body}".encode(), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, sig):
        raise InvalidToken("Bad signature")
    payload = json.loads(_unb64(body))
    if now is not None and "exp" in payload and now >= payload["exp"]:
        raise InvalidToken("Token expired")
    return payload


# ───────────────────────── view decorators ─────────────────────────


def login_required(view):
    def wrapper(request, *a, **kw):
        if not getattr(request.user, "is_authenticated", False):
            return JsonResponse({"detail": "Authentication credentials were not provided."}, status=401)
        return view(request, *a, **kw)

    wrapper.__name__ = getattr(view, "__name__", "view")
    return wrapper


def require_auth(request):
    if not getattr(request.user, "is_authenticated", False):
        raise NotAuthenticated()
    return request.user
