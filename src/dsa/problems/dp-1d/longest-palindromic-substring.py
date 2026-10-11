def longest_palindrome(s):
    best_start, best_len = 0, 0                #@init

    def expand(left, right):                   #@def
        while left >= 0 and right < len(s) and s[left] == s[right]:   #@loop
            left -= 1                          #@grow
            right += 1
        return left + 1, right - left - 1      #@ret

    for i in range(len(s)):                    #@centers
        for l, r in ((i, i), (i, i + 1)):
            start, length = expand(l, r)       #@try
            if length > best_len:              #@better
                best_start, best_len = start, length   #@keep
    return s[best_start:best_start + best_len]   #@done
