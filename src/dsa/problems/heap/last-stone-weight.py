import heapq


def last_stone_weight(stones):
    heap = [-s for s in stones]                #@build
    heapq.heapify(heap)                        #@heapify
    while len(heap) > 1:                       #@loop
        first = -heapq.heappop(heap)           #@popFirst
        second = -heapq.heappop(heap)          #@popSecond
        if first != second:                    #@differ
            heapq.heappush(heap, -(first - second))   #@pushDiff
    return -heap[0] if heap else 0             #@done
