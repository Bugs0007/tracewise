def min_cost_climbing_stairs(cost):
    n = len(cost)
    dp = [0] * (n + 1)                         #@init
    for i in range(2, n + 1):                  #@loop
        dp[i] = min(dp[i - 1] + cost[i - 1], dp[i - 2] + cost[i - 2])   #@fill
    return dp[n]                               #@done
