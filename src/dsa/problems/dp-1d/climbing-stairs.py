def climb_stairs(n):
    if n <= 2:                                 #@small
        return n                               #@smallRet
    dp = [0] * (n + 1)                         #@init
    dp[1], dp[2] = 1, 2                        #@base
    for i in range(3, n + 1):                  #@loop
        dp[i] = dp[i - 1] + dp[i - 2]          #@fill
    return dp[n]                               #@done
