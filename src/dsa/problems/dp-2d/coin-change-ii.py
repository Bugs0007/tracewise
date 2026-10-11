def change(amount, coins):
    dp = [1] + [0] * amount                    #@init
    for coin in coins:                         #@coin
        for a in range(coin, amount + 1):      #@amount
            dp[a] += dp[a - coin]              #@add
    return dp[amount]                          #@done
