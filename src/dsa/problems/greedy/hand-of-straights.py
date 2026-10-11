from collections import Counter


def is_n_straight_hand(hand, group_size):
    if len(hand) % group_size:                 #@size
        return False                           #@sizeRet
    counts = Counter(hand)                     #@count
    for card in sorted(counts):                #@loop
        need = counts[card]                    #@need
        if need:                               #@has
            for nxt in range(card, card + group_size):   #@group
                if counts[nxt] < need:         #@check
                    return False               #@fail
                counts[nxt] -= need            #@take
    return True                                #@done
