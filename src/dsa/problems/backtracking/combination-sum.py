def combination_sum(candidates, target):
    nums = sorted(candidates)                  #@sort
    res = []                                   #@init
    path = []                                  #@path

    def dfs(start, remaining):                 #@def
        if remaining == 0:                     #@hit
            res.append(path[:])                #@record
            return                             #@hitRet
        for i in range(start, len(nums)):      #@loop
            if nums[i] > remaining:            #@prune
                break                          #@break
            path.append(nums[i])               #@choose
            dfs(i, remaining - nums[i])        #@explore
            path.pop()                         #@undo

    dfs(0, target)                             #@start
    return res                                 #@done
