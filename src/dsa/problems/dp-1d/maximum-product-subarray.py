def max_product(nums):
    best = hi = lo = nums[0]                   #@init
    for x in nums[1:]:                         #@loop
        candidates = (x, hi * x, lo * x)       #@cand
        hi, lo = max(candidates), min(candidates)   #@update
        best = max(best, hi)                   #@best
    return best                                #@done
