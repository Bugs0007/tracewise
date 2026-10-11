def my_pow(x, n):
    if n < 0:                                  #@neg
        x, n = 1 / x, -n                       #@flip
    result = 1.0                               #@init
    while n:                                   #@loop
        if n & 1:                              #@odd
            result *= x                        #@mul
        x *= x                                 #@square
        n >>= 1                                #@shift
    return result                              #@done
