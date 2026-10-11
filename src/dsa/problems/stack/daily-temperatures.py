def daily_temperatures(temps):
    res = [0] * len(temps)                     #@init
    stack = []                                 #@stack
    for i, t in enumerate(temps):              #@loop
        while stack and temps[stack[-1]] < t:  #@while
            j = stack.pop()                    #@pop
            res[j] = i - j                     #@set
        stack.append(i)                        #@push
    return res                                 #@done
