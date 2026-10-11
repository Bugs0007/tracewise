from collections import defaultdict, deque


def ladder_length(begin_word, end_word, word_list):
    words = set(word_list)
    if end_word not in words:
        return 0
    buckets = defaultdict(list)                #@buckets
    for w in sorted(words | {begin_word}):
        for i in range(len(w)):
            buckets[w[:i] + "*" + w[i + 1:]].append(w)   #@pattern
    queue = deque([(begin_word, 1)])           #@queue
    seen = {begin_word}                        #@seen
    while queue:                               #@loop
        word, steps = queue.popleft()          #@pop
        if word == end_word:                   #@goal
            return steps                       #@goalRet
        for i in range(len(word)):
            for nxt in buckets[word[:i] + "*" + word[i + 1:]]:   #@neighbors
                if nxt not in seen:            #@check
                    seen.add(nxt)
                    queue.append((nxt, steps + 1))   #@push
    return 0                                   #@fail
