def reorder_list(head):
    if not head or not head.next:              #@guard
        return                                 #@guardRet
    slow, fast = head, head                    #@ptrs
    while fast.next and fast.next.next:        #@findMid
        slow = slow.next                       #@slow
        fast = fast.next.next                  #@fast
    second = slow.next                         #@split
    slow.next = None                           #@cut
    prev = None                                #@revInit
    while second:                              #@revLoop
        nxt = second.next                      #@revSave
        second.next = prev                     #@revFlip
        prev = second                          #@revPrev
        second = nxt                           #@revNext
    first, second = head, prev                 #@merge
    while second:                              #@mergeLoop
        n1, n2 = first.next, second.next       #@save2
        first.next = second                    #@link1
        second.next = n1                       #@link2
        first, second = n1, n2                 #@adv
