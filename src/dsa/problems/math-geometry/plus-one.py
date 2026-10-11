def plus_one(digits):
    for i in range(len(digits) - 1, -1, -1):   #@loop
        if digits[i] < 9:                      #@small
            digits[i] += 1                     #@inc
            return digits                      #@early
        digits[i] = 0                          #@carry
    return [1] + digits                        #@grow
