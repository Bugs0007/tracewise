def pacific_atlantic(heights):
    rows, cols = len(heights), len(heights[0])

    def flood(starts):                         #@def
        seen = set(starts)                     #@seed
        stack = list(starts)
        while stack:                           #@loop
            r, c = stack.pop()                 #@pop
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and (nr, nc) not in seen and heights[nr][nc] >= heights[r][c]:   #@check
                    seen.add((nr, nc))         #@add
                    stack.append((nr, nc))
        return seen                            #@ret

    pacific = flood([(0, c) for c in range(cols)] + [(r, 0) for r in range(rows)])   #@pac
    atlantic = flood([(rows - 1, c) for c in range(cols)] + [(r, cols - 1) for r in range(rows)])   #@atl
    return [[r, c] for r, c in sorted(pacific & atlantic)]   #@done
