from bisect import bisect_left


def length_of_lis(nums):
    tails = []                                 #@init
    for x in nums:                             #@loop
        i = bisect_left(tails, x)              #@find
        if i == len(tails):                    #@end
            tails.append(x)                    #@append
        else:
            tails[i] = x                       #@replace
    return len(tails)                          #@done
