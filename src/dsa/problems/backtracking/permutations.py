def permute(nums):
    res = []                                   #@init
    path = []                                  #@path
    used = [False] * len(nums)                 #@used

    def dfs():                                 #@def
        if len(path) == len(nums):             #@full
            res.append(path[:])                #@record
            return                             #@fullRet
        for i in range(len(nums)):             #@loop
            if used[i]:                        #@skipUsed
                continue
            used[i] = True                     #@mark
            path.append(nums[i])               #@choose
            dfs()                              #@explore
            path.pop()                         #@undo
            used[i] = False                    #@unmark

    dfs()                                      #@start
    return res                                 #@done
