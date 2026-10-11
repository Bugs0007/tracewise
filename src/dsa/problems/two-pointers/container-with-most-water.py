def max_area(height):
    lo, hi = 0, len(height) - 1                #@init
    best = 0                                   #@best
    while lo < hi:                             #@loop
        area = (hi - lo) * min(height[lo], height[hi])   #@area
        best = max(best, area)                 #@update
        if height[lo] < height[hi]:            #@cmp
            lo += 1                            #@moveLo
        else:
            hi -= 1                            #@moveHi
    return best                                #@done
