def clone_graph(node):
    if node is None:
        return None
    copies = {}                                #@init

    def dfs(cur):                              #@def
        if cur in copies:                      #@seen
            return copies[cur]                 #@seenRet
        copy = Node(cur.val)                   #@make
        copies[cur] = copy                     #@store
        for nb in cur.neighbors:               #@loop
            copy.neighbors.append(dfs(nb))     #@link
        return copy                            #@ret

    return dfs(node)                           #@start
