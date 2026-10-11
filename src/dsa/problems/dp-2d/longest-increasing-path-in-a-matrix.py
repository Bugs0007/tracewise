def longest_increasing_path(matrix):
    rows, cols = len(matrix), len(matrix[0])
    memo = {}                                  #@memo

    def dfs(r, c):                             #@def
        if (r, c) in memo:                     #@cached
            return memo[(r, c)]                #@cachedRet
        best = 1                               #@best
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and matrix[nr][nc] > matrix[r][c]:   #@check
                best = max(best, 1 + dfs(nr, nc))   #@recurse
        memo[(r, c)] = best                    #@store
        return best                            #@ret

    return max(dfs(r, c) for r in range(rows) for c in range(cols))   #@done
