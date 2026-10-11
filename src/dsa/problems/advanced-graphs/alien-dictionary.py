import heapq


def alien_order(words):
    letters = {ch for w in words for ch in w}  #@letters
    after = {ch: set() for ch in letters}      #@after
    indegree = {ch: 0 for ch in letters}       #@indegree
    for a, b in zip(words, words[1:]):         #@pairs
        if len(a) > len(b) and a.startswith(b):   #@prefix
            return ""                          #@prefixRet
        for x, y in zip(a, b):                 #@diff
            if x != y:
                if y not in after[x]:
                    after[x].add(y)            #@edge
                    indegree[y] += 1
                break
    heap = [ch for ch in letters if indegree[ch] == 0]   #@seed
    heapq.heapify(heap)
    order = []                                 #@order
    while heap:                                #@loop
        ch = heapq.heappop(heap)               #@pop
        order.append(ch)                       #@take
        for nxt in after[ch]:                  #@next
            indegree[nxt] -= 1                 #@dec
            if indegree[nxt] == 0:
                heapq.heappush(heap, nxt)      #@push
    return "".join(order) if len(order) == len(letters) else ""   #@done
