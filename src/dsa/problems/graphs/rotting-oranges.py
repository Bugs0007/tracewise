from collections import deque


def oranges_rotting(grid):
    rows, cols = len(grid), len(grid[0])
    queue = deque()                            #@queue
    fresh = 0                                  #@fresh
    for r in range(rows):
        for c in range(cols):
            if grid[r][c] == 2:
                queue.append((r, c))           #@seed
            elif grid[r][c] == 1:
                fresh += 1
    minutes = 0                                #@minutes
    while queue and fresh:                     #@loop
        minutes += 1                           #@minute
        for _ in range(len(queue)):            #@level
            r, c = queue.popleft()             #@pop
            for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nr, nc = r + dr, c + dc
                if 0 <= nr < rows and 0 <= nc < cols and grid[nr][nc] == 1:   #@check
                    grid[nr][nc] = 2           #@rot
                    fresh -= 1
                    queue.append((nr, nc))     #@push
    return minutes if fresh == 0 else -1       #@done
