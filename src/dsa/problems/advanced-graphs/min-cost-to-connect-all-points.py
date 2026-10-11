import heapq


def min_cost_connect_points(points):
    n = len(points)
    in_tree = set()                            #@tree
    heap = [(0, 0)]                            #@heap
    total = 0                                  #@total
    while len(in_tree) < n:                    #@loop
        cost, i = heapq.heappop(heap)          #@pop
        if i in in_tree:                       #@skip
            continue
        in_tree.add(i)                         #@add
        total += cost                          #@pay
        for j in range(n):                     #@scan
            if j not in in_tree:
                d = abs(points[i][0] - points[j][0]) + abs(points[i][1] - points[j][1])
                heapq.heappush(heap, (d, j))   #@push
    return total                               #@done
