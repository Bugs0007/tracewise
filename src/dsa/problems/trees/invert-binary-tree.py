def invert_tree(root):
    if root is None:                           #@base
        return None                            #@baseRet
    root.left, root.right = invert_tree(root.right), invert_tree(root.left)   #@swap
    return root                                #@done
