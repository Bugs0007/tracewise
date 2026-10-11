def find_words(board, words):
    root = {}                                  #@build
    for word in words:
        node = root
        for ch in word:
            node = node.setdefault(ch, {})
        node["$"] = word                       #@mark
    rows, cols = len(board), len(board[0])
    found = []                                 #@init

    def dfs(r, c, node):                       #@dfsDef
        ch = board[r][c]                       #@ch
        nxt = node.get(ch)                     #@next
        if nxt is None:                        #@prune
            return                             #@pruneRet
        if "$" in nxt:                         #@hit
            found.append(nxt.pop("$"))         #@add
        board[r][c] = "#"                      #@visit
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):   #@dirs
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and board[nr][nc] != "#":   #@bounds
                dfs(nr, nc, nxt)               #@recurse
        board[r][c] = ch                       #@restore

    for r in range(rows):                      #@scan
        for c in range(cols):
            dfs(r, c, root)                    #@start
    return found                               #@done
