def partition(s):
    res = []                                   #@init
    path = []                                  #@path

    def dfs(start):                            #@def
        if start == len(s):                    #@end
            res.append(path[:])                #@record
            return                             #@endRet
        for end in range(start + 1, len(s) + 1):   #@loop
            piece = s[start:end]               #@piece
            if piece == piece[::-1]:           #@check
                path.append(piece)             #@choose
                dfs(end)                       #@explore
                path.pop()                     #@undo

    dfs(0)                                     #@start
    return res                                 #@done
