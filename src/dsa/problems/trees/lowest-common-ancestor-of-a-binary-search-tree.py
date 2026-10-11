def lowest_common_ancestor(root, p, q):
    node = root                                #@init
    while node:                                #@loop
        if p.val < node.val and q.val < node.val:   #@bothLeft
            node = node.left                   #@goLeft
        elif p.val > node.val and q.val > node.val: #@bothRight
            node = node.right                  #@goRight
        else:
            return node                        #@found
    return None                                #@none
