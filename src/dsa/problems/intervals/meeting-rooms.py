def can_attend_meetings(intervals):
    ordered = sorted(intervals)                #@sort
    for i in range(1, len(ordered)):           #@loop
        if ordered[i][0] < ordered[i - 1][1]:  #@clash
            return False                       #@clashRet
    return True                                #@done
