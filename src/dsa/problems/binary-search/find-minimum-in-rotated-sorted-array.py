def find_min(nums):
    lo, hi = 0, len(nums) - 1                  #@init
    while lo < hi:                             #@loop
        mid = (lo + hi) // 2                   #@mid
        if nums[mid] > nums[hi]:               #@cmp
            lo = mid + 1                       #@goRight
        else:
            hi = mid                           #@goLeft
    return nums[lo]                            #@done
