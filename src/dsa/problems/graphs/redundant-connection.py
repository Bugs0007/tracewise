def find_redundant_connection(edges):
    parent = list(range(len(edges) + 1))       #@init

    def find(x):                               #@findDef
        while parent[x] != x:                  #@findLoop
            parent[x] = parent[parent[x]]      #@compress
            x = parent[x]
        return x                               #@findRet

    for a, b in edges:                         #@loop
        ra, rb = find(a), find(b)              #@roots
        if ra == rb:                           #@cycle
            return [a, b]                      #@found
        parent[ra] = rb                        #@union
    return []                                  #@none
