def max_path_sum(root):
    best = float("-inf")                       #@init

    def gain(node):                            #@def
        nonlocal best                          #@nonlocal
        if node is None:                       #@base
            return 0                           #@baseRet
        left = max(gain(node.left), 0)         #@left
        right = max(gain(node.right), 0)       #@right
        best = max(best, node.val + left + right)   #@update
        return node.val + max(left, right)     #@ret

    gain(root)                                 #@start
    return best                                #@done
