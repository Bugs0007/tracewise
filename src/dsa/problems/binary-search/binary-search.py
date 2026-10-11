def search(nums, target):
    lo, hi = 0, len(nums) - 1                  #@init
    while lo <= hi:                            #@loop
        mid = (lo + hi) // 2                   #@mid
        if nums[mid] == target:                #@eq
            return mid                         #@found
        if nums[mid] < target:                 #@less
            lo = mid + 1                       #@goRight
        else:
            hi = mid - 1                       #@goLeft
    return -1                                  #@miss
