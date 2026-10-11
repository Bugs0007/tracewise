import heapq


def min_interval(intervals, queries):
    intervals = sorted(intervals)              #@sort
    heap = []                                  #@heap
    answer = {}                                #@answer
    i = 0                                      #@pointer
    for q in sorted(queries):                  #@loop
        while i < len(intervals) and intervals[i][0] <= q:   #@add
            heapq.heappush(heap, (intervals[i][1] - intervals[i][0] + 1, intervals[i][1]))   #@push
            i += 1
        while heap and heap[0][1] < q:         #@expire
            heapq.heappop(heap)                #@pop
        answer[q] = heap[0][0] if heap else -1   #@set
    return [answer[q] for q in queries]        #@done
