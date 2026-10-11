def can_jump(nums):
    reach = 0                                  #@init
    for i, step in enumerate(nums):            #@loop
        if i > reach:                          #@stuck
            return False                       #@stuckRet
        reach = max(reach, i + step)           #@update
    return True                                #@done
