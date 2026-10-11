def is_balanced(root):
    def height(node):                          #@def
        if node is None:                       #@base
            return 0                           #@baseRet
        left = height(node.left)               #@left
        if left == -1:                         #@leftBad
            return -1                          #@leftBadRet
        right = height(node.right)             #@right
        if right == -1 or abs(left - right) > 1:   #@check
            return -1                          #@bad
        return 1 + max(left, right)            #@ret

    return height(root) != -1                  #@done
