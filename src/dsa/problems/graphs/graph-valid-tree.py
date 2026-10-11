def valid_tree(n, edges):
    if len(edges) != n - 1:                    #@count
        return False                           #@countRet
    parent = list(range(n))                    #@init

    def find(x):                               #@findDef
        while parent[x] != x:                  #@findLoop
            parent[x] = parent[parent[x]]      #@compress
            x = parent[x]
        return x                               #@findRet

    for a, b in edges:                         #@loop
        ra, rb = find(a), find(b)              #@roots
        if ra == rb:                           #@cycle
            return False                       #@cycleRet
        parent[ra] = rb                        #@union
    return True                                #@done
