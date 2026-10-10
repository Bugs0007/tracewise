def contains_duplicate(nums):
    seen = set()                           #@init
    for x in nums:                         #@loop
        if x in seen:                      #@check
            return True                    #@dup
        seen.add(x)                        #@add
    return False                           #@done
