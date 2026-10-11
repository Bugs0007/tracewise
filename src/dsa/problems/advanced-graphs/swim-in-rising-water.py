import heapq


def swim_in_water(grid):
    n = len(grid)
    heap = [(grid[0][0], 0, 0)]                #@heap
    seen = {(0, 0)}                            #@seen
    while heap:                                #@loop
        t, r, c = heapq.heappop(heap)          #@pop
        if r == n - 1 and c == n - 1:          #@goal
            return t                           #@goalRet
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nr, nc = r + dr, c + dc
            if 0 <= nr < n and 0 <= nc < n and (nr, nc) not in seen:   #@check
                seen.add((nr, nc))             #@mark
                heapq.heappush(heap, (max(t, grid[nr][nc]), nr, nc))   #@push
    return -1                                  #@none
