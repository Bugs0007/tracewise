def set_zeroes(matrix):
    rows, cols = len(matrix), len(matrix[0])
    zero_rows = {r for r in range(rows) for c in range(cols) if matrix[r][c] == 0}   #@findRows
    zero_cols = {c for r in range(rows) for c in range(cols) if matrix[r][c] == 0}   #@findCols
    for r in range(rows):                      #@apply
        for c in range(cols):
            if r in zero_rows or c in zero_cols:   #@check
                matrix[r][c] = 0               #@zero
    return matrix                              #@done
