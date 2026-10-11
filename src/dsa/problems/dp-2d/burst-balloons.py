def max_coins(nums):
    vals = [1] + nums + [1]                    #@pad
    n = len(vals)
    dp = [[0] * n for _ in range(n)]           #@init
    for length in range(2, n):                 #@len
        for left in range(0, n - length):      #@left
            right = left + length
            for last in range(left + 1, right):   #@last
                coins = vals[left] * vals[last] * vals[right] + dp[left][last] + dp[last][right]   #@coins
                dp[left][right] = max(dp[left][right], coins)   #@best
    return dp[0][n - 1]                        #@done
