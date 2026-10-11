def remove_nth_from_end(head, n):
    dummy = ListNode(0, head)                  #@dummy
    lead = dummy                               #@lead
    for _ in range(n):                         #@advance
        lead = lead.next                       #@leadStep
    trail = dummy                              #@trail
    while lead.next:                           #@loop
        lead = lead.next                       #@lead2
        trail = trail.next                     #@trail2
    trail.next = trail.next.next               #@unlink
    return dummy.next                          #@done
