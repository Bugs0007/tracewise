def min_distance(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]   #@init
    for i in range(len(a) + 1):
        dp[i][0] = i                           #@baseCol
    for j in range(len(b) + 1):
        dp[0][j] = j                           #@baseRow
    for i in range(1, len(a) + 1):             #@rows
        for j in range(1, len(b) + 1):         #@cols
            if a[i - 1] == b[j - 1]:           #@match
                dp[i][j] = dp[i - 1][j - 1]    #@same
            else:
                dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])   #@edit
    return dp[len(a)][len(b)]                  #@done
