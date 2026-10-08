class ValidationError(Exception):
    """Raised by serializers and model validation. `detail` is a dict or list of messages."""

    def __init__(self, detail):
        super().__init__(detail)
        self.detail = detail


class Http404(Exception):
    pass


class PermissionDenied(Exception):
    pass


class NotAuthenticated(Exception):
    pass
