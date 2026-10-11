def find_duplicate(nums):
    slow = fast = nums[0]                      #@init
    while True:                                #@loop1
        slow = nums[slow]                      #@slow
        fast = nums[nums[fast]]                #@fast
        if slow == fast:                       #@meet
            break                              #@brk
    slow = nums[0]                             #@reset
    while slow != fast:                        #@loop2
        slow = nums[slow]                      #@slow2
        fast = nums[fast]                      #@fast2
    return slow                                #@done
