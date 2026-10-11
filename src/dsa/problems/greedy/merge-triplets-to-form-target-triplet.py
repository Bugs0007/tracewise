def merge_triplets(triplets, target):
    got = [False, False, False]                #@init
    for t in triplets:                         #@loop
        if t[0] <= target[0] and t[1] <= target[1] and t[2] <= target[2]:   #@ok
            for k in range(3):                 #@pos
                if t[k] == target[k]:          #@hit
                    got[k] = True              #@mark
    return all(got)                            #@done
