def is_interleave(s1, s2, s3):
    if len(s1) + len(s2) != len(s3):           #@length
        return False                           #@lengthRet
    dp = [[False] * (len(s2) + 1) for _ in range(len(s1) + 1)]   #@init
    dp[0][0] = True                            #@base
    for i in range(len(s1) + 1):               #@rows
        for j in range(len(s2) + 1):           #@cols
            if i > 0 and dp[i - 1][j] and s1[i - 1] == s3[i + j - 1]:   #@fromTop
                dp[i][j] = True                #@setTop
            if j > 0 and dp[i][j - 1] and s2[j - 1] == s3[i + j - 1]:   #@fromLeft
                dp[i][j] = True                #@setLeft
    return dp[len(s1)][len(s2)]                #@done
