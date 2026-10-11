def length_of_longest_substring(s):
    last = {}                                  #@init
    left = 0                                   #@left
    best = 0                                   #@best
    for right, ch in enumerate(s):             #@loop
        if ch in last and last[ch] >= left:    #@dup
            left = last[ch] + 1                #@shrink
        last[ch] = right                       #@record
        best = max(best, right - left + 1)     #@update
    return best                                #@done
