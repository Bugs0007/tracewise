import type { TopicContent } from '../types';

const topic: TopicContent = {
  intro: [
    'A trie (prefix tree) stores a set of words so that words with the same beginning share the same path of nodes. Each node represents one prefix; each edge is one letter. Asking "is this word stored?" or "does any word start with this?" becomes a walk of one step per letter, no matter how many words are stored.',
    'The two small ideas: a node is just a dict from letter to child, and a separate end marker says whether a word finishes at that node. Without the marker you cannot tell the stored word "app" from the prefix of "apple".',
    'Tries shine when you ask many prefix questions, or when a search over the input (a board, a wildcard pattern) should be pruned as soon as no word can continue.',
  ],
  checklist: [
    'The problem is about prefixes: autocomplete, startsWith, longest common prefix, many words sharing beginnings.',
    'You search a board or a pattern against many words at once: build a trie and walk it in step with the search.',
    'You need to stop exploring as soon as no word can match: the trie gives that answer in O(1).',
    'A wildcard such as "." means "try every child at this node".',
    'You need to distinguish "word stored" from "prefix present": keep an end marker.',
  ],
  template: [
    {
      title: 'Dict-based trie',
      code: `root = {}
def insert(word):
    node = root
    for ch in word:
        node = node.setdefault(ch, {})
    node["$"] = True            # a word ends here

def walk(text):
    node = root
    for ch in text:
        if ch not in node:
            return None
        node = node[ch]
    return node                 # node for this prefix`,
    },
    {
      title: 'Wildcard search',
      code: `def dfs(i, node):
    if i == len(word):
        return "$" in node
    if word[i] == ".":
        return any(dfs(i + 1, child) for key, child in node.items() if key != "$")
    return word[i] in node and dfs(i + 1, node[word[i]])`,
    },
    {
      title: 'Prune a board search with the trie',
      code: `def dfs(r, c, node):
    nxt = node.get(board[r][c])
    if nxt is None:
        return                  # no word continues this path
    if "$" in nxt:
        found.append(nxt.pop("$"))
    ...mark, recurse into neighbours, unmark...`,
    },
  ],
  boss: {
    seconds: 300,
    problem: 'design-add-and-search-words-data-structure',
    note: 'The boss problem is Design Add and Search Words Data Structure. Decide what each trie node stores, then how a "." changes the search.',
    quiz: [
      {
        prompt: 'In a trie that holds only the word "apple", what does search("app") return and why?',
        options: ['False: the path exists but no word ends at "app"', 'True: "app" is a prefix', 'It raises an error', 'True because apple contains app'],
        answer: 0,
        explain: 'search needs a word to end exactly at the node. starts_with("app") would be True.',
      },
      {
        prompt: 'What is the main advantage of a trie over a set of words for prefix queries?',
        options: ['The cost depends on the prefix length, not on the number of words', 'It uses less memory in every case', 'It keeps words sorted by length', 'It needs no extra code'],
        answer: 0,
        explain: 'A set would scan every word to answer starts_with; a trie follows one path of L nodes.',
      },
      {
        prompt: 'When a search pattern has "." at the current position, what do you do?',
        options: ['Try every child; succeed if any branch matches', 'Skip the character', 'Follow only the first child', 'Fail'],
        answer: 0,
        explain: 'A dot can stand for any letter, so every existing child is a candidate.',
      },
      {
        prompt: 'In Word Search II, why is a trie better than running a normal word search once per word?',
        options: ['One walk follows all words at once and prunes when no word shares the prefix', 'It avoids recursion', 'It makes the board smaller', 'It sorts the words'],
        answer: 0,
        explain: 'Shared prefixes are explored once, and a missing child cuts the whole branch.',
      },
      {
        prompt: 'Inserting "cart" into a trie that already stores "car" creates how many new nodes?',
        options: ['1, for the letter "t"', '4, one per letter', '0, because "car" is already there', '2'],
        answer: 0,
        explain: 'The nodes c, a and r are shared. Only "t" is new, and it gets the end marker.',
      },
    ],
  },
};

export default topic;
