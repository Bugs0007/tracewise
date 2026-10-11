import heapq


def merge_k_lists(lists):
    heap = []                                  #@init
    for i, node in enumerate(lists):           #@seed
        if node:                               #@seedHas
            heapq.heappush(heap, (node.val, i, node))   #@seedPush
    dummy = ListNode()                         #@dummy
    tail = dummy                               #@tail
    while heap:                                #@loop
        val, i, node = heapq.heappop(heap)     #@pop
        tail.next = node                       #@attach
        tail = node                            #@move
        if node.next:                          #@hasNext
            heapq.heappush(heap, (node.next.val, i, node.next))   #@pushNext
    return dummy.next                          #@done
