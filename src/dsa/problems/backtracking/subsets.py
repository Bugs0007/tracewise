def subsets(nums):
    res = []                                   #@init
    path = []                                  #@path

    def dfs(i):                                #@def
        if i == len(nums):                     #@leaf
            res.append(path[:])                #@record
            return                             #@leafRet
        path.append(nums[i])                   #@take
        dfs(i + 1)                             #@takeRec
        path.pop()                             #@undo
        dfs(i + 1)                             #@skip

    dfs(0)                                     #@start
    return res                                 #@done
