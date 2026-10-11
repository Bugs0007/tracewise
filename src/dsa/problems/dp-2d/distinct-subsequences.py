def num_distinct(s, t):
    dp = [[0] * (len(t) + 1) for _ in range(len(s) + 1)]   #@init
    for i in range(len(s) + 1):
        dp[i][0] = 1                           #@base
    for i in range(1, len(s) + 1):             #@rows
        for j in range(1, len(t) + 1):         #@cols
            dp[i][j] = dp[i - 1][j]            #@skip
            if s[i - 1] == t[j - 1]:           #@match
                dp[i][j] += dp[i - 1][j - 1]   #@take
    return dp[len(s)][len(t)]                  #@done
