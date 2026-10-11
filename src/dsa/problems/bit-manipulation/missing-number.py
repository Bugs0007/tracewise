def missing_number(nums):
    result = len(nums)                         #@init
    for i, x in enumerate(nums):               #@loop
        result ^= i ^ x                        #@xor
    return result                              #@done
