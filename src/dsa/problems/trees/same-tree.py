def is_same_tree(p, q):
    if p is None and q is None:                #@bothNone
        return True                            #@bothRet
    if p is None or q is None or p.val != q.val:   #@mismatch
        return False                           #@mismatchRet
    return is_same_tree(p.left, q.left) and is_same_tree(p.right, q.right)   #@recurse
