def count_bits(n):
    bits = [0] * (n + 1)                       #@init
    for i in range(1, n + 1):                  #@loop
        bits[i] = bits[i >> 1] + (i & 1)       #@fill
    return bits                                #@done
