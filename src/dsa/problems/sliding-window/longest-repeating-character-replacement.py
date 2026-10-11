def character_replacement(s, k):
    count = {}                                 #@init
    left = 0                                   #@left
    best = 0                                   #@best
    for right, ch in enumerate(s):             #@loop
        count[ch] = count.get(ch, 0) + 1       #@add
        while (right - left + 1) - max(count.values()) > k:   #@check
            count[s[left]] -= 1                #@drop
            left += 1                          #@shrink
        best = max(best, right - left + 1)     #@update
    return best                                #@done
