def is_subtree(root, sub_root):
    def same(a, b):                            #@sameDef
        if a is None and b is None:            #@sameBoth
            return True                        #@sameTrue
        if a is None or b is None or a.val != b.val:   #@sameMismatch
            return False                       #@sameFalse
        return same(a.left, b.left) and same(a.right, b.right)   #@sameRec

    if root is None:                           #@noRoot
        return sub_root is None                #@noRootRet
    if same(root, sub_root):                   #@try
        return True                            #@hit
    return is_subtree(root.left, sub_root) or is_subtree(root.right, sub_root)   #@down
