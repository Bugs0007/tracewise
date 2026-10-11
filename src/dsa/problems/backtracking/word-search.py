def exist(board, word):
    rows, cols = len(board), len(board[0])     #@dims

    def dfs(r, c, i):                          #@def
        if i == len(word):                     #@done
            return True                        #@doneRet
        if not (0 <= r < rows and 0 <= c < cols) or board[r][c] != word[i]:   #@bad
            return False                       #@badRet
        keep = board[r][c]                     #@keep
        board[r][c] = "#"                      #@mark
        found = (dfs(r + 1, c, i + 1) or dfs(r - 1, c, i + 1)
                 or dfs(r, c + 1, i + 1) or dfs(r, c - 1, i + 1))   #@explore
        board[r][c] = keep                     #@restore
        return found                           #@ret

    return any(dfs(r, c, 0) for r in range(rows) for c in range(cols))   #@start
