def erase_overlap_intervals(intervals):
    removed = 0                                #@init
    last_end = float("-inf")                   #@last
    for start, end in sorted(intervals, key=lambda x: x[1]):   #@loop
        if start >= last_end:                  #@fits
            last_end = end                     #@keep
        else:
            removed += 1                       #@drop
    return removed                             #@done
