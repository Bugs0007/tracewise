def is_anagram(s, t):
    if len(s) != len(t):                   #@len
        return False                       #@lenfail
    count = {}                             #@init
    for ch in s:                           #@countLoop
        count[ch] = count.get(ch, 0) + 1   #@inc
    for ch in t:                           #@spendLoop
        if count.get(ch, 0) == 0:          #@check
            return False                   #@miss
        count[ch] -= 1                     #@dec
    return True                            #@done
