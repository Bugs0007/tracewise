def is_valid_sudoku(board):
    rows = [set() for _ in range(9)]       #@init
    cols = [set() for _ in range(9)]       #@initCols
    boxes = [set() for _ in range(9)]      #@initBoxes
    for r in range(9):                     #@rowLoop
        for c in range(9):                 #@colLoop
            d = board[r][c]                #@cell
            if d == ".":                   #@empty
                continue                   #@skip
            b = (r // 3) * 3 + c // 3      #@box
            if d in rows[r] or d in cols[c] or d in boxes[b]:   #@check
                return False               #@clash
            rows[r].add(d)                 #@addRow
            cols[c].add(d)                 #@addCol
            boxes[b].add(d)                #@addBox
    return True                            #@done
