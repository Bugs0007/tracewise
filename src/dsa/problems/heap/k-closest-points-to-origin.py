import heapq


def k_closest(points, k):
    heap = []                                  #@init
    for x, y in points:                        #@loop
        dist = x * x + y * y                   #@dist
        heapq.heappush(heap, (-dist, x, y))    #@push
        if len(heap) > k:                      #@over
            heapq.heappop(heap)                #@pop
    return [[x, y] for _, x, y in heap]        #@done
