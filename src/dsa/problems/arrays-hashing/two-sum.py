def two_sum(nums, target):
    seen = {}                              #@init
    for i, x in enumerate(nums):           #@loop
        need = target - x                  #@need
        if need in seen:                   #@check
            return [seen[need], i]         #@found
        seen[x] = i                        #@store
    return []                              #@none
