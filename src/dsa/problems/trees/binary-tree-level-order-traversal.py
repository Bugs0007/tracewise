from collections import deque


def level_order(root):
    res = []                                   #@init
    if root is None:                           #@guard
        return res                             #@guardRet
    queue = deque([root])                      #@queue
    while queue:                               #@loop
        level = []                             #@level
        for _ in range(len(queue)):            #@size
            node = queue.popleft()             #@pop
            level.append(node.val)             #@visit
            if node.left:                      #@hasLeft
                queue.append(node.left)        #@pushLeft
            if node.right:                     #@hasRight
                queue.append(node.right)       #@pushRight
        res.append(level)                      #@add
    return res                                 #@done
