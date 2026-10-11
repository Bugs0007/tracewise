def diameter_of_binary_tree(root):
    best = 0                                   #@init

    def height(node):                          #@def
        nonlocal best                          #@nonlocal
        if node is None:                       #@base
            return 0                           #@baseRet
        left = height(node.left)               #@left
        right = height(node.right)             #@right
        best = max(best, left + right)         #@update
        return 1 + max(left, right)            #@ret

    height(root)                               #@start
    return best                                #@done
