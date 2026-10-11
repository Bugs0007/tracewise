def count_substrings(s):
    total = 0                                  #@init
    for center in range(2 * len(s) - 1):       #@centers
        left = center // 2                     #@left
        right = left + center % 2              #@right
        while left >= 0 and right < len(s) and s[left] == s[right]:   #@loop
            total += 1                         #@count
            left -= 1
            right += 1
    return total                               #@done
