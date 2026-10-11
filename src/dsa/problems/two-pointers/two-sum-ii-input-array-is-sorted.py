def two_sum_sorted(numbers, target):
    lo, hi = 0, len(numbers) - 1               #@init
    while lo < hi:                             #@loop
        s = numbers[lo] + numbers[hi]          #@sum
        if s == target:                        #@eq
            return [lo + 1, hi + 1]            #@found
        if s < target:                         #@less
            lo += 1                            #@moveLo
        else:
            hi -= 1                            #@moveHi
    return []                                  #@none
