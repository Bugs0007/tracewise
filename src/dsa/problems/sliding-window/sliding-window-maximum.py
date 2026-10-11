from collections import deque


def max_sliding_window(nums, k):
    out = []                                   #@init
    dq = deque()                               #@dq
    for i, x in enumerate(nums):               #@loop
        while dq and nums[dq[-1]] <= x:        #@pop
            dq.pop()                           #@popBack
        dq.append(i)                           #@push
        if dq[0] <= i - k:                     #@expired
            dq.popleft()                       #@popFront
        if i >= k - 1:                         #@ready
            out.append(nums[dq[0]])            #@record
    return out                                 #@done
