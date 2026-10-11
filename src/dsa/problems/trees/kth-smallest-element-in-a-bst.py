def kth_smallest(root, k):
    stack = []                                 #@init
    node = root                                #@node
    while stack or node:                       #@loop
        while node:                            #@goLeft
            stack.append(node)                 #@push
            node = node.left                   #@left
        node = stack.pop()                     #@pop
        k -= 1                                 #@count
        if k == 0:                             #@check
            return node.val                    #@found
        node = node.right                      #@right
    return None                                #@none
