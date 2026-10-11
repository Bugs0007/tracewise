import heapq


class KthLargest:
    def __init__(self, k, nums):
        self.k = k                             #@initK
        self.heap = list(nums)                 #@initHeap
        heapq.heapify(self.heap)               #@heapify
        while len(self.heap) > self.k:         #@trimLoop
            heapq.heappop(self.heap)           #@trim

    def add(self, val):
        heapq.heappush(self.heap, val)         #@push
        if len(self.heap) > self.k:            #@over
            heapq.heappop(self.heap)           #@pop
        return self.heap[0]                    #@top
