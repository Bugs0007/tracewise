def merge_two_lists(l1, l2):
    dummy = ListNode()                         #@dummy
    tail = dummy                               #@tail
    while l1 and l2:                           #@loop
        if l1.val <= l2.val:                   #@cmp
            tail.next = l1                     #@take1
            l1 = l1.next                       #@adv1
        else:
            tail.next = l2                     #@take2
            l2 = l2.next                       #@adv2
        tail = tail.next                       #@move
    tail.next = l1 or l2                       #@rest
    return dummy.next                          #@done
