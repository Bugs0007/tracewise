def search_rotated(nums, target):
    lo, hi = 0, len(nums) - 1                  #@init
    while lo <= hi:                            #@loop
        mid = (lo + hi) // 2                   #@mid
        if nums[mid] == target:                #@eq
            return mid                         #@found
        if nums[lo] <= nums[mid]:              #@leftSorted
            if nums[lo] <= target < nums[mid]: #@inLeft
                hi = mid - 1                   #@leftGoLeft
            else:
                lo = mid + 1                   #@leftGoRight
        else:
            if nums[mid] < target <= nums[hi]: #@inRight
                lo = mid + 1                   #@rightGoRight
            else:
                hi = mid - 1                   #@rightGoLeft
    return -1                                  #@miss
