def hamming_weight(n):
    count = 0                                  #@init
    while n:                                   #@loop
        n &= n - 1                             #@clear
        count += 1                             #@count
    return count                               #@done
