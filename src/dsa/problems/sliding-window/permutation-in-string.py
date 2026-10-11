def check_inclusion(s1, s2):
    n = len(s1)                                #@init
    need = {}                                  #@need
    for ch in s1:                              #@needLoop
        need[ch] = need.get(ch, 0) + 1         #@needAdd
    window = {}                                #@window
    for right, ch in enumerate(s2):            #@loop
        window[ch] = window.get(ch, 0) + 1     #@enter
        if right >= n:                         #@tooBig
            out = s2[right - n]                #@out
            window[out] -= 1                   #@leave
            if window[out] == 0:               #@zero
                del window[out]                #@del
        if window == need:                     #@match
            return True                        #@yes
    return False                               #@no
