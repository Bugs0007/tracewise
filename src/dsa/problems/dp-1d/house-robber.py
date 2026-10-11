def rob(nums):
    prev, curr = 0, 0                          #@init
    for money in nums:                         #@loop
        prev, curr = curr, max(curr, prev + money)   #@update
    return curr                                #@done
