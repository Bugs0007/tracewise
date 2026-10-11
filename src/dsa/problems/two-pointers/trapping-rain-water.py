def trap(height):
    lo, hi = 0, len(height) - 1                #@init
    left_max = right_max = 0                   #@maxes
    water = 0                                  #@water
    while lo < hi:                             #@loop
        if height[lo] < height[hi]:            #@cmp
            left_max = max(left_max, height[lo])   #@lmax
            water += left_max - height[lo]     #@addL
            lo += 1                            #@moveLo
        else:
            right_max = max(right_max, height[hi]) #@rmax
            water += right_max - height[hi]    #@addR
            hi -= 1                            #@moveHi
    return water                               #@done
