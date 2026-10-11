import heapq
from collections import Counter, deque


def least_interval(tasks, n):
    heap = [-c for c in Counter(tasks).values()]   #@count
    heapq.heapify(heap)                        #@heapify
    waiting = deque()                          #@wait
    time = 0                                   #@time
    while heap or waiting:                     #@loop
        time += 1                              #@tick
        if heap:                               #@has
            left = 1 + heapq.heappop(heap)     #@run
            if left:                           #@leftover
                waiting.append((left, time + n))   #@cool
        if waiting and waiting[0][1] == time:  #@ready
            heapq.heappush(heap, waiting.popleft()[0])   #@back
    return time                                #@done
