import heapq


def network_delay_time(times, n, k):
    graph = {i: [] for i in range(1, n + 1)}   #@graph
    for u, v, w in times:
        graph[u].append((v, w))
    dist = {}                                  #@dist
    heap = [(0, k)]                            #@heap
    while heap:                                #@loop
        d, node = heapq.heappop(heap)          #@pop
        if node in dist:                       #@skip
            continue                           #@skipRet
        dist[node] = d                         #@settle
        for nxt, w in graph[node]:             #@relax
            if nxt not in dist:                #@check
                heapq.heappush(heap, (d + w, nxt))   #@push
    return max(dist.values()) if len(dist) == n else -1   #@done
