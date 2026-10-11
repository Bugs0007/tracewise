def check_valid_string(s):
    lo = hi = 0                                #@init
    for ch in s:                               #@loop
        if ch == "(":                          #@open
            lo += 1
            hi += 1
        elif ch == ")":                        #@close
            lo -= 1
            hi -= 1
        else:                                  #@star
            lo -= 1
            hi += 1
        if hi < 0:                             #@dead
            return False                       #@deadRet
        lo = max(lo, 0)                        #@clamp
    return lo == 0                             #@done
