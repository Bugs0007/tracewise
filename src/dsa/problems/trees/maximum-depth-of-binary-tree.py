def max_depth(root):
    if root is None:                           #@base
        return 0                               #@baseRet
    left = max_depth(root.left)                #@left
    right = max_depth(root.right)              #@right
    return 1 + max(left, right)                #@done
