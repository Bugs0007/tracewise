def is_match(s, p):
    m, n = len(s), len(p)
    dp = [[False] * (n + 1) for _ in range(m + 1)]   #@init
    dp[0][0] = True                            #@base
    for j in range(2, n + 1):                  #@emptyRow
        if p[j - 1] == "*":
            dp[0][j] = dp[0][j - 2]            #@star0
    for i in range(1, m + 1):                  #@rows
        for j in range(1, n + 1):              #@cols
            if p[j - 1] == "*":                #@isStar
                dp[i][j] = dp[i][j - 2]        #@zero
                if p[j - 2] in (s[i - 1], "."):   #@prev
                    dp[i][j] = dp[i][j] or dp[i - 1][j]   #@more
            elif p[j - 1] in (s[i - 1], "."):  #@single
                dp[i][j] = dp[i - 1][j - 1]    #@diag
    return dp[m][n]                            #@done
