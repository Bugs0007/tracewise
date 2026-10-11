def rob_circle(nums):
    if len(nums) == 1:                         #@single
        return nums[0]                         #@singleRet

    def line(houses):                          #@def
        prev, curr = 0, 0                      #@init
        for money in houses:                   #@loop
            prev, curr = curr, max(curr, prev + money)   #@update
        return curr                            #@ret

    return max(line(nums[1:]), line(nums[:-1]))   #@done
