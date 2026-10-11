def merge(intervals):
    merged = []                                #@init
    for start, end in sorted(intervals):       #@loop
        if merged and start <= merged[-1][1]:  #@overlap
            merged[-1][1] = max(merged[-1][1], end)   #@extend
        else:
            merged.append([start, end])        #@add
    return merged                              #@done
