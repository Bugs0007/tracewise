def reverse_bits(n):
    result = 0                                 #@init
    for _ in range(32):                        #@loop
        result = (result << 1) | (n & 1)       #@shift
        n >>= 1                                #@next
    return result                              #@done
