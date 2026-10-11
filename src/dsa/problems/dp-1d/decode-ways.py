def num_decodings(s):
    n = len(s)
    dp = [0] * (n + 1)                         #@init
    dp[0] = 1                                  #@base
    for i in range(1, n + 1):                  #@loop
        if s[i - 1] != "0":                    #@one
            dp[i] += dp[i - 1]                 #@addOne
        if i >= 2 and 10 <= int(s[i - 2:i]) <= 26:   #@two
            dp[i] += dp[i - 2]                 #@addTwo
    return dp[n]                               #@done
