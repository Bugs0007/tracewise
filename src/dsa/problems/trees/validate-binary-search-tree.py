def is_valid_bst(root):
    def check(node, low, high):                #@def
        if node is None:                       #@base
            return True                        #@baseRet
        if not (low < node.val < high):        #@range
            return False                       #@bad
        return check(node.left, low, node.val) and check(node.right, node.val, high)   #@recurse

    return check(root, float("-inf"), float("inf"))   #@start
