def min_window(s, t):
    if not t or len(t) > len(s):               #@guard
        return ""                              #@guardRet
    need = {}                                  #@need
    for ch in t:                               #@needLoop
        need[ch] = need.get(ch, 0) + 1         #@needAdd
    missing = len(t)                           #@missing
    best = (0, float("inf"))                   #@best
    left = 0                                   #@left
    for right, ch in enumerate(s):             #@loop
        if need.get(ch, 0) > 0:                #@useful
            missing -= 1                       #@dec
        need[ch] = need.get(ch, 0) - 1         #@take
        while missing == 0:                    #@covered
            if right - left < best[1] - best[0]:   #@better
                best = (left, right)           #@record
            need[s[left]] += 1                 #@giveBack
            if need[s[left]] > 0:              #@broke
                missing += 1                   #@inc
            left += 1                          #@shrink
    if best[1] == float("inf"):                #@none
        return ""                              #@noRet
    return s[best[0] : best[1] + 1]            #@done
