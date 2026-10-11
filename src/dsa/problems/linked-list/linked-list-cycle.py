def has_cycle(head):
    slow = fast = head                         #@init
    while fast and fast.next:                  #@loop
        slow = slow.next                       #@slow
        fast = fast.next.next                  #@fast
        if slow is fast:                       #@meet
            return True                        #@yes
    return False                               #@no
