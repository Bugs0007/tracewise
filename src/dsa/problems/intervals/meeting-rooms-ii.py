def min_meeting_rooms(intervals):
    starts = sorted(s for s, _ in intervals)   #@starts
    ends = sorted(e for _, e in intervals)     #@ends
    rooms = 0                                  #@init
    j = 0                                      #@pointer
    for s in starts:                           #@loop
        if s >= ends[j]:                       #@free
            j += 1                             #@reuse
        else:
            rooms += 1                         #@open
    return rooms                               #@done
