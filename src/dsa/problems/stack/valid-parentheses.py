def is_valid(s):
    pairs = {")": "(", "]": "[", "}": "{"}     #@init
    stack = []                                 #@stack
    for ch in s:                               #@loop
        if ch in pairs:                        #@isClose
            if not stack or stack[-1] != pairs[ch]:   #@check
                return False                   #@fail
            stack.pop()                        #@pop
        else:
            stack.append(ch)                   #@push
    return not stack                           #@done
