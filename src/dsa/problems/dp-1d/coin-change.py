def coin_change(coins, amount):
    INF = amount + 1
    dp = [0] + [INF] * amount                  #@init
    for a in range(1, amount + 1):             #@loop
        for coin in coins:                     #@coin
            if coin <= a:
                dp[a] = min(dp[a], dp[a - coin] + 1)   #@fill
    return dp[amount] if dp[amount] != INF else -1   #@done
