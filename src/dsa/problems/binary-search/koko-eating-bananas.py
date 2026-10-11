def min_eating_speed(piles, h):
    lo, hi = 1, max(piles)                     #@init
    while lo < hi:                             #@loop
        mid = (lo + hi) // 2                   #@mid
        hours = sum((p + mid - 1) // mid for p in piles)   #@hours
        if hours <= h:                         #@feasible
            hi = mid                           #@goLeft
        else:
            lo = mid + 1                       #@goRight
    return lo                                  #@done
