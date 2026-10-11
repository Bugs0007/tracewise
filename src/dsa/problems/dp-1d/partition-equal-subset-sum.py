def can_partition(nums):
    total = sum(nums)
    if total % 2:                              #@odd
        return False                           #@oddRet
    target = total // 2                        #@target
    dp = [True] + [False] * target             #@init
    for x in nums:                             #@loop
        for s in range(target, x - 1, -1):     #@inner
            if dp[s - x]:                      #@check
                dp[s] = True                   #@set
    return dp[target]                          #@done
