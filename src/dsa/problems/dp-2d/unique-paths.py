def unique_paths(m, n):
    dp = [[1] * n for _ in range(m)]           #@init
    for r in range(1, m):                      #@rows
        for c in range(1, n):                  #@cols
            dp[r][c] = dp[r - 1][c] + dp[r][c - 1]   #@fill
    return dp[m - 1][n - 1]                    #@done
