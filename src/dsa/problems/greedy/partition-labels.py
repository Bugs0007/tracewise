def partition_labels(s):
    last = {ch: i for i, ch in enumerate(s)}   #@last
    sizes = []                                 #@sizes
    start = end = 0                            #@init
    for i, ch in enumerate(s):                 #@loop
        end = max(end, last[ch])               #@extend
        if i == end:                           #@cut
            sizes.append(end - start + 1)      #@add
            start = i + 1
    return sizes                               #@done
