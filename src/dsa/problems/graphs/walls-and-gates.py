from collections import deque

INF = 2147483647


def walls_and_gates(rooms):
    rows, cols = len(rooms), len(rooms[0])
    queue = deque((r, c) for r in range(rows) for c in range(cols) if rooms[r][c] == 0)   #@seed
    while queue:                               #@loop
        r, c = queue.popleft()                 #@pop
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):   #@dirs
            nr, nc = r + dr, c + dc
            if 0 <= nr < rows and 0 <= nc < cols and rooms[nr][nc] == INF:   #@check
                rooms[nr][nc] = rooms[r][c] + 1   #@set
                queue.append((nr, nc))         #@push
    return rooms                               #@done
