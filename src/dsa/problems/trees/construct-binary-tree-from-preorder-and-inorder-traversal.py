def build_tree(preorder, inorder):
    index = {v: i for i, v in enumerate(inorder)}   #@index
    pre = iter(preorder)                       #@iter

    def build(lo, hi):                         #@def
        if lo > hi:                            #@base
            return None                        #@baseRet
        val = next(pre)                        #@take
        root = TreeNode(val)                   #@make
        mid = index[val]                       #@mid
        root.left = build(lo, mid - 1)         #@left
        root.right = build(mid + 1, hi)        #@right
        return root                            #@ret

    return build(0, len(inorder) - 1)          #@start
