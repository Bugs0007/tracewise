def word_break(s, words):
    word_set = set(words)                      #@set
    dp = [True] + [False] * len(s)             #@init
    for end in range(1, len(s) + 1):           #@loop
        for start in range(end):               #@start
            if dp[start] and s[start:end] in word_set:   #@check
                dp[end] = True                 #@mark
                break
    return dp[len(s)]                          #@done
