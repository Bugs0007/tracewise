def largest_rectangle_area(heights):
    stack = []                                 #@init
    best = 0                                   #@best
    for i, h in enumerate(heights):            #@loop
        start = i                              #@start
        while stack and stack[-1][1] > h:      #@while
            idx, height = stack.pop()          #@pop
            best = max(best, height * (i - idx))   #@area
            start = idx                        #@extend
        stack.append((start, h))               #@push
    for idx, height in stack:                  #@rest
        best = max(best, height * (len(heights) - idx))   #@restArea
    return best                                #@done
