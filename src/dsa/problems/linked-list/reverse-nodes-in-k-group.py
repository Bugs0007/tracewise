def reverse_k_group(head, k):
    dummy = ListNode(0, head)                  #@dummy
    group_prev = dummy                         #@gp
    while True:                                #@loop
        kth = group_prev                       #@findStart
        for _ in range(k):                     #@findLoop
            kth = kth.next                     #@findStep
            if not kth:                        #@short
                return dummy.next              #@done
        group_next = kth.next                  #@next
        prev, curr = group_next, group_prev.next   #@revInit
        while curr != group_next:              #@revLoop
            nxt = curr.next                    #@revSave
            curr.next = prev                   #@revFlip
            prev, curr = curr, nxt             #@revStep
        tmp = group_prev.next                  #@tmp
        group_prev.next = kth                  #@hook
        group_prev = tmp                       #@advance
