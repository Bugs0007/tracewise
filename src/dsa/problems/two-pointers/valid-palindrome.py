def is_palindrome(s):
    l, r = 0, len(s) - 1                       #@init
    while l < r:                               #@loop
        if not s[l].isalnum():                 #@skipL
            l += 1                             #@moveL
        elif not s[r].isalnum():               #@skipR
            r -= 1                             #@moveR
        elif s[l].lower() != s[r].lower():     #@cmp
            return False                       #@no
        else:
            l += 1                             #@stepL
            r -= 1                             #@stepR
    return True                                #@yes
