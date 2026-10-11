def solve_n_queens(n):
    res = []                                   #@init
    cols, diag1, diag2 = set(), set(), set()   #@sets
    queens = []                                #@queens

    def dfs(r):                                #@def
        if r == n:                             #@full
            res.append(["." * c + "Q" + "." * (n - c - 1) for c in queens])   #@record
            return                             #@fullRet
        for c in range(n):                     #@loop
            if c in cols or r - c in diag1 or r + c in diag2:   #@conflict
                continue                       #@skip
            cols.add(c)                        #@place
            diag1.add(r - c)
            diag2.add(r + c)
            queens.append(c)
            dfs(r + 1)                         #@explore
            queens.pop()                       #@undo
            cols.remove(c)
            diag1.remove(r - c)
            diag2.remove(r + c)

    dfs(0)                                     #@start
    return res                                 #@done
