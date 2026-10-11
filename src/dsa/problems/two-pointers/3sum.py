def three_sum(nums):
    nums.sort()                                #@sort
    res = []                                   #@res
    for i in range(len(nums) - 2):             #@loop
        if i > 0 and nums[i] == nums[i - 1]:   #@dupI
            continue                           #@skip
        lo, hi = i + 1, len(nums) - 1          #@ptrs
        while lo < hi:                         #@while
            s = nums[i] + nums[lo] + nums[hi]  #@sum
            if s < 0:                          #@neg
                lo += 1                        #@moveLo
            elif s > 0:                        #@pos
                hi -= 1                        #@moveHi
            else:
                res.append([nums[i], nums[lo], nums[hi]])   #@add
                lo += 1                        #@afterLo
                while lo < hi and nums[lo] == nums[lo - 1]: #@dupLo
                    lo += 1                    #@dupLoStep
                hi -= 1                        #@afterHi
    return res                                 #@done
