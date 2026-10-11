def jump(nums):
    jumps = end = farthest = 0                 #@init
    for i in range(len(nums) - 1):             #@loop
        farthest = max(farthest, i + nums[i])  #@far
        if i == end:                           #@edge
            jumps += 1                         #@count
            end = farthest                     #@move
    return jumps                               #@done
