def insert(intervals, new_interval):
    result = []                                #@init
    start, end = new_interval                  #@new
    i, n = 0, len(intervals)
    while i < n and intervals[i][1] < start:   #@before
        result.append(intervals[i])            #@keep
        i += 1
    while i < n and intervals[i][0] <= end:    #@overlap
        start = min(start, intervals[i][0])    #@mergeStart
        end = max(end, intervals[i][1])        #@mergeEnd
        i += 1
    result.append([start, end])                #@place
    result.extend(intervals[i:])               #@after
    return result                              #@done
