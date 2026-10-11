def reverse_list(head):
    prev = None                                #@init
    curr = head                                #@curr
    while curr:                                #@loop
        nxt = curr.next                        #@save
        curr.next = prev                       #@flip
        prev = curr                            #@advPrev
        curr = nxt                             #@advCurr
    return prev                                #@done
