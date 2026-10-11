def add_two_numbers(l1, l2):
    dummy = ListNode()                         #@dummy
    tail = dummy                               #@tail
    carry = 0                                  #@carry
    while l1 or l2 or carry:                   #@loop
        total = carry                          #@start
        if l1:                                 #@has1
            total += l1.val                    #@add1
            l1 = l1.next                       #@adv1
        if l2:                                 #@has2
            total += l2.val                    #@add2
            l2 = l2.next                       #@adv2
        tail.next = ListNode(total % 10)       #@node
        tail = tail.next                       #@move
        carry = total // 10                    #@newCarry
    return dummy.next                          #@done
