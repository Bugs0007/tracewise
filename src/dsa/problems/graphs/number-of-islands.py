def num_islands(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen = set()                               #@init

    def dfs(r, c):                             #@def
        if not (0 <= r < rows and 0 <= c < cols) or grid[r][c] == 0 or (r, c) in seen:   #@guard
            return                             #@guardRet
        seen.add((r, c))                       #@mark
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):   #@dirs
            dfs(r + dr, c + dc)                #@recurse

    count = 0                                  #@count
    for r in range(rows):                      #@scan
        for c in range(cols):
            if grid[r][c] == 1 and (r, c) not in seen:   #@new
                dfs(r, c)                      #@flood
                count += 1                     #@inc
    return count                               #@done
