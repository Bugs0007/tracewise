def max_area_of_island(grid):
    if not grid:
        return 0
    rows, cols = len(grid), len(grid[0])
    seen = set()                               #@init

    def dfs(r, c):                             #@def
        if not (0 <= r < rows and 0 <= c < cols) or grid[r][c] == 0 or (r, c) in seen:   #@guard
            return 0                           #@guardRet
        seen.add((r, c))                       #@mark
        area = 1                               #@area
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):   #@dirs
            area += dfs(r + dr, c + dc)        #@recurse
        return area                            #@ret

    best = 0                                   #@best
    for r in range(rows):                      #@scan
        for c in range(cols):
            best = max(best, dfs(r, c))        #@update
    return best                                #@done
