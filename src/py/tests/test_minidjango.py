import sys
import unittest

sys.dont_write_bytecode = True


def fresh():
    for name in list(sys.modules):
        if name.split(".")[0] == "minidjango":
            del sys.modules[name]
    import minidjango

    return minidjango


class ORMTests(unittest.TestCase):
    def setUp(self):
        md = fresh()
        self.md = md
        m = md.models

        class Author(m.Model):
            name = m.CharField(max_length=50, unique=True)

        class Book(m.Model):
            title = m.CharField(max_length=100)
            pages = m.IntegerField(default=100)
            author = m.ForeignKey(Author, on_delete=m.CASCADE, related_name="books")

            class Meta:
                ordering = ["title"]

        class Tag(m.Model):
            label = m.CharField(max_length=20)
            books = m.ManyToManyField(Book, related_name="tags")

        self.Author, self.Book, self.Tag = Author, Book, Tag
        a = Author.objects.create(name="Ada")
        b = Author.objects.create(name="Bob")
        for i, (t, au) in enumerate([("Zeta", a), ("Alpha", a), ("Mid", b)]):
            Book.objects.create(title=t, pages=100 * (i + 1), author=au)
        md.connection.reset_queries()

    def test_lazy_and_filter(self):
        qs = self.Book.objects.filter(pages__gte=200)
        self.assertEqual(self.md.connection.queries, [])  # lazy
        self.assertEqual([b.title for b in qs], ["Alpha", "Mid"])
        self.assertEqual(len(self.md.connection.queries), 1)
        list(qs)  # cached
        self.assertEqual(len(self.md.connection.queries), 1)
        self.assertIn("WHERE book.pages >= 200", qs.query)
        self.assertIn("ORDER BY book.title ASC", qs.query)

    def test_lookups_across_fk_and_q(self):
        Q = self.md.models.Q
        self.assertEqual(self.Book.objects.filter(author__name="Ada").count(), 2)
        self.assertEqual(self.Book.objects.filter(Q(title="Mid") | Q(pages=100)).count(), 2)
        self.assertEqual(self.Book.objects.exclude(author__name="Ada").get().title, "Mid")
        self.assertIn("INNER JOIN author", self.Book.objects.filter(author__name="Ada").query)
        with self.assertRaises(self.Book.DoesNotExist):
            self.Book.objects.get(title="nope")
        with self.assertRaises(self.Book.MultipleObjectsReturned):
            self.Book.objects.get(author__name="Ada")

    def test_n_plus_one_vs_select_related(self):
        c = self.md.connection
        names = [b.author.name for b in self.Book.objects.all()]
        self.assertEqual(names, ["Ada", "Bob", "Ada"])
        self.assertEqual(c.query_count, 4)  # 1 + N
        c.reset_queries()
        names = [b.author.name for b in self.Book.objects.select_related("author")]
        self.assertEqual(c.query_count, 1)
        self.assertIn("JOIN author", c.queries[0]["sql"])

    def test_prefetch_reverse(self):
        c = self.md.connection
        counts = {a.name: len(a.books.all()) for a in self.Author.objects.prefetch_related("books")}
        self.assertEqual(counts, {"Ada": 2, "Bob": 1})
        self.assertEqual(c.query_count, 2)

    def test_m2m(self):
        t = self.Tag.objects.create(label="classic")
        t.books.add(*self.Book.objects.filter(author__name="Ada"))
        self.assertEqual(sorted(b.title for b in t.books.all()), ["Alpha", "Zeta"])
        alpha = self.Book.objects.get(title="Alpha")
        self.assertEqual([x.label for x in alpha.tags.all()], ["classic"])

    def test_values_slicing_update_delete_cascade(self):
        self.assertEqual(list(self.Book.objects.values_list("title", flat=True)[:2]), ["Alpha", "Mid"])
        self.assertEqual(self.Book.objects.values("title")[0], {"title": "Alpha"})
        self.assertEqual(self.Book.objects.filter(pages__lt=250).update(pages=1), 2)
        self.assertEqual(self.Book.objects.filter(pages=1).count(), 2)
        self.Author.objects.get(name="Ada").delete()
        self.assertEqual(self.Book.objects.count(), 1)

    def test_unique_and_index_scan(self):
        with self.assertRaises(self.md.db.IntegrityError):
            self.Author.objects.create(name="Ada")
        c = self.md.connection
        c.reset_queries()
        self.Author.objects.get(name="Bob")
        self.assertEqual(c.queries[0]["index"], "name")
        self.Book.objects.filter(title="Mid").first()
        self.assertIsNone(c.queries[-1]["index"])

    def test_transactions(self):
        tx = self.md.transaction
        try:
            with tx.atomic():
                self.Author.objects.create(name="Cy")
                raise RuntimeError("boom")
        except RuntimeError:
            pass
        self.assertFalse(self.Author.objects.filter(name="Cy").exists())
        with tx.atomic():
            self.Author.objects.create(name="Dee")
        self.assertTrue(self.Author.objects.filter(name="Dee").exists())
        sqls = self.md.query_log()
        self.assertIn("ROLLBACK", sqls)
        self.assertIn("COMMIT", sqls)


class HttpTests(unittest.TestCase):
    def setUp(self):
        md = fresh()
        self.md = md
        from minidjango import models as m, serializers as s
        from minidjango.http import App, JsonResponse, path, get_object_or_404, require_http_methods
        from minidjango.test import Client
        from minidjango import auth

        class Note(m.Model):
            title = m.CharField(max_length=20)
            body = m.TextField(default="")

        class NoteSerializer(s.ModelSerializer):
            class Meta:
                model = Note
                fields = ["id", "title", "body"]

        @require_http_methods(["GET", "POST"])
        def notes(request):
            if request.method == "POST":
                ser = NoteSerializer(data=request.data)
                ser.is_valid(raise_exception=True)
                return JsonResponse(NoteSerializer(ser.save()).data, status=201)
            return JsonResponse({"results": NoteSerializer(Note.objects.all(), many=True).data})

        def note(request, pk):
            return JsonResponse(NoteSerializer(get_object_or_404(Note, pk=pk)).data)

        @auth.login_required
        def me(request):
            return JsonResponse({"user": request.user.username})

        def login_view(request):
            u = auth.authenticate(request.data.get("username"), request.data.get("password"))
            if not u:
                return JsonResponse({"detail": "bad credentials"}, status=401)
            auth.login(request, u)
            return JsonResponse({"ok": True})

        order = []

        def first(get_response):
            def mw(request):
                order.append("first in")
                r = get_response(request)
                order.append("first out")
                return r

            return mw

        def second(get_response):
            def mw(request):
                order.append("second in")
                r = get_response(request)
                order.append("second out")
                return r

            return mw

        self.order = order
        app = App(
            [path("notes/", notes), path("notes/<int:pk>/", note), path("me/", me), path("login/", login_view)],
            middleware=[first, second, auth.SessionMiddleware, auth.AuthenticationMiddleware],
        )
        self.client = Client(app)
        auth.create_user("ada", "s3cret!")

    def test_crud_and_validation(self):
        r = self.client.post("/notes/", {"title": "hi"})
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.json()["title"], "hi")
        r = self.client.post("/notes/", {"title": "x" * 30})
        self.assertEqual(r.status_code, 400)
        self.assertIn("title", r.json())
        self.assertEqual(self.client.post("/notes/", {}).json(), {"title": ["This field is required."]})
        self.assertEqual(len(self.client.get("/notes/").json()["results"]), 1)
        self.assertEqual(self.client.get("/notes/99/").status_code, 404)
        self.assertEqual(self.client.delete("/notes/").status_code, 405)
        self.assertEqual(self.client.get("/nope/").status_code, 404)

    def test_middleware_order(self):
        self.client.get("/notes/")
        self.assertEqual(self.order, ["first in", "second in", "second out", "first out"])

    def test_session_login(self):
        self.assertEqual(self.client.get("/me/").status_code, 401)
        self.assertEqual(self.client.post("/login/", {"username": "ada", "password": "nope"}).status_code, 401)
        self.assertEqual(self.client.post("/login/", {"username": "ada", "password": "s3cret!"}).status_code, 200)
        self.assertEqual(self.client.get("/me/").json(), {"user": "ada"})

    def test_passwords_and_jwt(self):
        from minidjango import auth

        h = auth.make_password("pw")
        self.assertTrue(auth.check_password("pw", h))
        self.assertFalse(auth.check_password("PW", h))
        self.assertNotEqual(auth.make_password("pw"), h)  # salted
        tok = auth.jwt_encode({"sub": 1, "exp": 100}, "k")
        self.assertEqual(auth.jwt_decode(tok, "k", now=50)["sub"], 1)
        with self.assertRaises(auth.InvalidToken):
            auth.jwt_decode(tok, "other")
        with self.assertRaises(auth.InvalidToken):
            auth.jwt_decode(tok, "k", now=100)

    def test_migrations_diff(self):
        from minidjango import migrations, models as m

        class Post(m.Model):
            title = m.CharField(max_length=10)

        old = migrations.project_state(Post)

        class Post(m.Model):  # noqa: F811
            title = m.CharField(max_length=20)
            slug = m.SlugField(max_length=30, unique=True)

        new = migrations.project_state(Post)
        ops = migrations.diff(old, new)
        self.assertIn("AddField Post.slug SlugField(max_length=30, unique)", ops)
        self.assertTrue(any(o.startswith("AlterField Post.title") for o in ops))


if __name__ == "__main__":
    unittest.main()
