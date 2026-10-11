from collections import deque


def right_side_view(root):
    res = []                                   #@init
    if root is None:                           #@guard
        return res                             #@guardRet
    queue = deque([root])                      #@queue
    while queue:                               #@loop
        size = len(queue)                      #@size
        for i in range(size):                  #@forLoop
            node = queue.popleft()             #@pop
            if i == size - 1:                  #@last
                res.append(node.val)           #@take
            if node.left:                      #@hasLeft
                queue.append(node.left)        #@pushLeft
            if node.right:                     #@hasRight
                queue.append(node.right)       #@pushRight
    return res                                 #@done
