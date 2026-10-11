import heapq


def find_kth_largest(nums, k):
    heap = []                                  #@init
    for num in nums:                           #@loop
        heapq.heappush(heap, num)              #@push
        if len(heap) > k:                      #@over
            heapq.heappop(heap)                #@pop
    return heap[0]                             #@done
