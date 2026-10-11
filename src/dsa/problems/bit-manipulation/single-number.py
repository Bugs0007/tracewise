def single_number(nums):
    result = 0                                 #@init
    for x in nums:                             #@loop
        result ^= x                            #@xor
    return result                              #@done
