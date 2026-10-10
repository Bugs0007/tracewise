def longest_consecutive(nums):
    values = set(nums)                     #@init
    best = 0                               #@best
    for n in values:                       #@loop
        if n - 1 not in values:            #@isStart
            length = 1                     #@startRun
            while n + length in values:    #@extend
                length += 1                #@grow
            best = max(best, length)       #@update
    return best                            #@done
