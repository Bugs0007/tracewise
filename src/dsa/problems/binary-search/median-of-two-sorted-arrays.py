def find_median(a, b):
    if len(a) > len(b):                        #@swap
        a, b = b, a                            #@swapDo
    total = len(a) + len(b)                    #@total
    half = (total + 1) // 2                    #@half
    lo, hi = 0, len(a)                         #@init
    while lo <= hi:                            #@loop
        i = (lo + hi) // 2                     #@cutA
        j = half - i                           #@cutB
        a_left = a[i - 1] if i > 0 else float("-inf")      #@aLeft
        a_right = a[i] if i < len(a) else float("inf")     #@aRight
        b_left = b[j - 1] if j > 0 else float("-inf")      #@bLeft
        b_right = b[j] if j < len(b) else float("inf")     #@bRight
        if a_left <= b_right and b_left <= a_right:        #@ok
            if total % 2:                      #@odd
                return float(max(a_left, b_left))          #@retOdd
            return (max(a_left, b_left) + min(a_right, b_right)) / 2   #@retEven
        if a_left > b_right:                   #@tooBig
            hi = i - 1                         #@goLeft
        else:
            lo = i + 1                         #@goRight
