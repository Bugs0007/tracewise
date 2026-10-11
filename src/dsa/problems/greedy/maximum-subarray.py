def max_sub_array(nums):
    best = curr = nums[0]                      #@init
    for x in nums[1:]:                         #@loop
        curr = max(x, curr + x)                #@extend
        best = max(best, curr)                 #@best
    return best                                #@done
