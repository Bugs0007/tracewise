import unittest

from minillm import MockLLM, count_tokens, embed, tokenize, tool_call


def cos(a, b):
    return sum(x * y for x, y in zip(a, b))


class MiniLLMTests(unittest.TestCase):
    def test_tokenize(self):
        self.assertEqual(tokenize("Tokenization rocks!"), ["Toke", "##niza", "##tion", "rock", "##s", "!"])
        self.assertEqual(count_tokens("a b c"), 3)

    def test_embed_is_deterministic_and_similar(self):
        a, b, c = embed("cats are cute"), embed("a cute cat"), embed("tax filing deadline")
        self.assertEqual(a, embed("cats are cute"))
        self.assertAlmostEqual(sum(x * x for x in a), 1.0, places=4)
        self.assertGreater(cos(a, b), cos(a, c))

    def test_mock_llm_script(self):
        llm = MockLLM([tool_call("search", q="weather"), "It is sunny."])
        r1 = llm.chat([{"role": "user", "content": "weather?"}], tools=[{"name": "search"}])
        self.assertEqual(r1["tool_calls"][0]["name"], "search")
        self.assertEqual(llm.chat([{"role": "tool", "content": "sunny"}])["content"], "It is sunny.")
        self.assertEqual(len(llm.calls), 2)
        with self.assertRaises(RuntimeError):
            llm.chat([])
        d = MockLLM({"refund": "Refunds take 5 days.", "*": "Sorry?"})
        self.assertEqual(d.complete("How do refunds work?"), "Refunds take 5 days.")
        self.assertEqual("".join(d.stream("hello")), "Sorry?")


if __name__ == "__main__":
    unittest.main()
