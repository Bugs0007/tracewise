def longest_common_subsequence(a, b):
    dp = [[0] * (len(b) + 1) for _ in range(len(a) + 1)]   #@init
    for i in range(1, len(a) + 1):             #@rows
        for j in range(1, len(b) + 1):         #@cols
            if a[i - 1] == b[j - 1]:           #@match
                dp[i][j] = dp[i - 1][j - 1] + 1   #@take
            else:
                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])   #@skip
    return dp[len(a)][len(b)]                  #@done
