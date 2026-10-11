def copy_random_list(head):
    if not head:                               #@guard
        return None                            #@guardRet
    copies = {}                                #@map
    node = head                                #@first
    while node:                                #@pass1
        copies[node] = Node(node.val)          #@make
        node = node.next                       #@step1
    node = head                                #@second
    while node:                                #@pass2
        copies[node].next = copies.get(node.next)          #@linkNext
        copies[node].random = copies.get(node.random)      #@linkRandom
        node = node.next                       #@step2
    return copies[head]                        #@done
