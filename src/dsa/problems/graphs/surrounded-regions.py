def solve(board):
    rows, cols = len(board), len(board[0])
    safe = set()                               #@init

    def dfs(r, c):                             #@def
        if not (0 <= r < rows and 0 <= c < cols) or board[r][c] != "O" or (r, c) in safe:   #@guard
            return                             #@guardRet
        safe.add((r, c))                       #@mark
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            dfs(r + dr, c + dc)                #@recurse

    for r in range(rows):                      #@border
        dfs(r, 0)
        dfs(r, cols - 1)
    for c in range(cols):
        dfs(0, c)
        dfs(rows - 1, c)
    return [["O" if (r, c) in safe else "X" for c in range(cols)] for r in range(rows)]   #@flip
