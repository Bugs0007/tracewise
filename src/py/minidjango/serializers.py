"""DRF-style serializers: declare fields, validate input, render output."""
import re

from .exceptions import ValidationError

_EMPTY = object()


class Field:
    def __init__(self, required=True, allow_null=False, default=_EMPTY, read_only=False, write_only=False, source=None):
        self.required = required and default is _EMPTY and not read_only
        self.allow_null = allow_null
        self.default = default
        self.read_only = read_only
        self.write_only = write_only
        self.source = source
        self.name = None

    def run_validation(self, value):
        if value is None:
            if self.allow_null:
                return None
            raise ValidationError("This field may not be null.")
        return self.to_internal(value)

    def to_internal(self, value):
        return value

    def to_representation(self, value):
        return value


class CharField(Field):
    def __init__(self, max_length=None, min_length=None, allow_blank=False, trim_whitespace=True, **kw):
        super().__init__(**kw)
        self.max_length = max_length
        self.min_length = min_length
        self.allow_blank = allow_blank
        self.trim = trim_whitespace

    def to_internal(self, value):
        if not isinstance(value, (str, int, float)) or isinstance(value, bool):
            raise ValidationError("Not a valid string.")
        value = str(value)
        if self.trim:
            value = value.strip()
        if value == "" and not self.allow_blank:
            raise ValidationError("This field may not be blank.")
        if self.max_length is not None and len(value) > self.max_length:
            raise ValidationError(f"Ensure this field has no more than {self.max_length} characters.")
        if self.min_length is not None and len(value) < self.min_length:
            raise ValidationError(f"Ensure this field has at least {self.min_length} characters.")
        return value


class EmailField(CharField):
    def to_internal(self, value):
        value = super().to_internal(value)
        if not re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", value):
            raise ValidationError("Enter a valid email address.")
        return value.lower()


class URLField(CharField):
    def to_internal(self, value):
        value = super().to_internal(value)
        if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", value):
            raise ValidationError("Enter a valid URL.")
        return value


class IntegerField(Field):
    def __init__(self, min_value=None, max_value=None, **kw):
        super().__init__(**kw)
        self.min_value = min_value
        self.max_value = max_value

    def to_internal(self, value):
        if isinstance(value, bool):
            raise ValidationError("A valid integer is required.")
        try:
            iv = int(value)
            if isinstance(value, float) and iv != value:
                raise ValueError
        except (TypeError, ValueError):
            raise ValidationError("A valid integer is required.")
        if self.min_value is not None and iv < self.min_value:
            raise ValidationError(f"Ensure this value is greater than or equal to {self.min_value}.")
        if self.max_value is not None and iv > self.max_value:
            raise ValidationError(f"Ensure this value is less than or equal to {self.max_value}.")
        return iv


class FloatField(IntegerField):
    def to_internal(self, value):
        try:
            return float(value)
        except (TypeError, ValueError):
            raise ValidationError("A valid number is required.")


class BooleanField(Field):
    def to_internal(self, value):
        if value in (True, "true", "True", 1, "1"):
            return True
        if value in (False, "false", "False", 0, "0"):
            return False
        raise ValidationError("Must be a valid boolean.")


class ChoiceField(Field):
    def __init__(self, choices, **kw):
        super().__init__(**kw)
        self.choices = list(choices)

    def to_internal(self, value):
        if value not in self.choices:
            raise ValidationError(f'"{value}" is not a valid choice.')
        return value


class ListField(Field):
    def __init__(self, child=None, min_length=None, **kw):
        super().__init__(**kw)
        self.child = child
        self.min_length = min_length

    def to_internal(self, value):
        if not isinstance(value, list):
            raise ValidationError("Expected a list of items.")
        if self.min_length is not None and len(value) < self.min_length:
            raise ValidationError(f"Ensure this field has at least {self.min_length} elements.")
        return [self.child.run_validation(v) for v in value] if self.child else value


class SerializerMethodField(Field):
    def __init__(self, method_name=None):
        super().__init__(read_only=True)
        self.method_name = method_name


class SerializerMeta(type):
    def __new__(mcs, name, bases, attrs):
        declared = {}
        for b in bases:
            declared.update(getattr(b, "_declared", {}))
        for k, v in list(attrs.items()):
            if isinstance(v, Field):
                v.name = k
                declared[k] = attrs.pop(k)
        cls = super().__new__(mcs, name, bases, attrs)
        cls._declared = declared
        return cls


class Serializer(metaclass=SerializerMeta):
    def __init__(self, instance=None, data=_EMPTY, many=False, partial=False, context=None):
        self.instance = instance
        self.initial_data = data
        self.many = many
        self.partial = partial
        self.context = context or {}
        self._errors = None
        self._validated = None

    def get_fields(self):
        return dict(self._declared)

    # ── input ──
    def is_valid(self, raise_exception=False):
        if self.initial_data is _EMPTY:
            raise AssertionError("Cannot call `.is_valid()` without passing `data=`.")
        errors = {}
        out = {}
        data = self.initial_data if isinstance(self.initial_data, dict) else None
        if data is None:
            errors["non_field_errors"] = ["Invalid data. Expected a dictionary."]
        else:
            for name, f in self.get_fields().items():
                if f.read_only:
                    continue
                if name not in data:
                    if self.partial:
                        continue
                    if f.default is not _EMPTY:
                        out[name] = f.default
                    elif f.required:
                        errors[name] = ["This field is required."]
                    continue
                try:
                    value = f.run_validation(data[name])
                    hook = getattr(self, f"validate_{name}", None)
                    if hook:
                        value = hook(value)
                    out[name] = value
                except ValidationError as e:
                    errors[name] = e.detail if isinstance(e.detail, list) else [e.detail]
            if not errors:
                try:
                    out = self.validate(out)
                except ValidationError as e:
                    if isinstance(e.detail, dict):
                        errors.update({k: v if isinstance(v, list) else [v] for k, v in e.detail.items()})
                    else:
                        errors["non_field_errors"] = e.detail if isinstance(e.detail, list) else [e.detail]
        self._errors = errors
        self._validated = out if not errors else {}
        if errors and raise_exception:
            raise ValidationError(errors)
        return not errors

    def validate(self, attrs):
        return attrs

    @property
    def errors(self):
        if self._errors is None:
            raise AssertionError("You must call `.is_valid()` before accessing `.errors`.")
        return self._errors

    @property
    def validated_data(self):
        if self._validated is None:
            raise AssertionError("You must call `.is_valid()` before accessing `.validated_data`.")
        return self._validated

    # ── output ──
    def to_representation(self, obj):
        out = {}
        for name, f in self.get_fields().items():
            if f.write_only:
                continue
            if isinstance(f, SerializerMethodField):
                out[name] = getattr(self, f.method_name or f"get_{name}")(obj)
                continue
            src = f.source or name
            value = obj
            for part in src.split("."):
                value = value.get(part) if isinstance(value, dict) else getattr(value, part, None)
            if isinstance(f, Serializer):
                value = f.to_representation(value) if value is not None else None
            out[name] = f.to_representation(value) if not isinstance(f, Serializer) else value
        return out

    @property
    def data(self):
        if self.instance is not None:
            if self.many:
                return [self.to_representation(o) for o in self.instance]
            return self.to_representation(self.instance)
        if self._validated is not None and not self._errors:
            return dict(self._validated)
        return {}

    # ── saving ──
    def save(self, **extra):
        data = {**self.validated_data, **extra}
        if self.instance is not None:
            self.instance = self.update(self.instance, data)
        else:
            self.instance = self.create(data)
        return self.instance

    def create(self, validated_data):
        raise NotImplementedError("`create()` must be implemented.")

    def update(self, instance, validated_data):
        raise NotImplementedError("`update()` must be implemented.")


# Nested serializers behave like fields
Serializer.required = True
Serializer.read_only = False
Serializer.write_only = False
Serializer.source = None
Serializer.default = _EMPTY


class ModelSerializer(Serializer):
    """Fields are generated from Meta.model / Meta.fields; create/update use the ORM."""

    def get_fields(self):
        from . import models as m

        meta = getattr(self, "Meta")
        model = meta.model
        names = meta.fields
        read_only = set(getattr(meta, "read_only_fields", ()))
        if names == "__all__":
            names = [f.name for f in model._meta.concrete]
        fields = {}
        for name in names:
            if name in self._declared:
                fields[name] = self._declared[name]
                continue
            mf = model._meta.get_field(name)
            if mf.primary_key or name in read_only or getattr(mf, "auto_now_add", False):
                f = Field(read_only=True)
            elif isinstance(mf, m.ForeignKey):
                f = IntegerField(required=not mf.null, allow_null=mf.null, source=mf.column)
            elif isinstance(mf, m.BooleanField):
                f = BooleanField(required=False, default=mf.default)
            elif isinstance(mf, m.IntegerField):
                f = IntegerField(required=mf.default is None and not mf.null, allow_null=mf.null)
            elif isinstance(mf, m.FloatField):
                f = FloatField(required=mf.default is None and not mf.null, allow_null=mf.null)
            elif isinstance(mf, m.EmailField):
                f = EmailField(max_length=mf.max_length, required=not mf.blank and mf.default is None)
            elif isinstance(mf, (m.CharField, m.TextField)):
                f = CharField(max_length=mf.max_length, required=not mf.blank and mf.default is None, allow_blank=mf.blank)
            else:
                f = Field(required=False)
            f.name = name
            fields[name] = f
        for k, v in self._declared.items():
            fields.setdefault(k, v)
        return fields

    def validate(self, attrs):
        model = self.Meta.model
        for f in model._meta.concrete:
            if f.unique and not f.primary_key and f.name in attrs:
                qs = model.objects.filter(**{f.name: attrs[f.name]})
                if self.instance is not None:
                    qs = qs.exclude(pk=self.instance.pk)
                if qs.exists():
                    raise ValidationError({f.name: [f"{model.__name__.lower()} with this {f.name} already exists."]})
        return attrs

    def _model_kwargs(self, data):
        from . import models as m

        model = self.Meta.model
        out = {}
        for k, v in data.items():
            try:
                mf = model._meta.get_field(k)
            except m.FieldError:
                out[k] = v
                continue
            out[mf.column if isinstance(mf, m.ForeignKey) and not isinstance(v, m.Model) else k] = v
        return out

    def create(self, validated_data):
        return self.Meta.model.objects.create(**self._model_kwargs(validated_data))

    def update(self, instance, validated_data):
        for k, v in self._model_kwargs(validated_data).items():
            if k.endswith("_id"):
                instance.__dict__[k] = v
                instance.__dict__["_cache"] = {}
            else:
                setattr(instance, k, v)
        instance.save()
        return instance
