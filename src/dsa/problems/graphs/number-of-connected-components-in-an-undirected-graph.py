def count_components(n, edges):
    parent = list(range(n))                    #@init

    def find(x):                               #@findDef
        while parent[x] != x:                  #@findLoop
            parent[x] = parent[parent[x]]      #@compress
            x = parent[x]
        return x                               #@findRet

    components = n                             #@count
    for a, b in edges:                         #@loop
        ra, rb = find(a), find(b)              #@roots
        if ra != rb:                           #@differ
            parent[ra] = rb                    #@union
            components -= 1                    #@dec
    return components                          #@done
