def good_nodes(root):
    def dfs(node, highest):                    #@def
        if node is None:                       #@base
            return 0                           #@baseRet
        good = 1 if node.val >= highest else 0 #@good
        highest = max(highest, node.val)       #@update
        return good + dfs(node.left, highest) + dfs(node.right, highest)   #@recurse

    return dfs(root, float("-inf"))            #@start
