def subsets_with_dup(nums):
    nums = sorted(nums)                        #@sort
    res = []                                   #@init
    path = []                                  #@path

    def dfs(start):                            #@def
        res.append(path[:])                    #@record
        for i in range(start, len(nums)):      #@loop
            if i > start and nums[i] == nums[i - 1]:   #@dup
                continue                       #@skipDup
            path.append(nums[i])               #@choose
            dfs(i + 1)                         #@explore
            path.pop()                         #@undo

    dfs(0)                                     #@start
    return res                                 #@done
