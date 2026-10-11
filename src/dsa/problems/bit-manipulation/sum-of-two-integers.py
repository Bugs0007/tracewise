def get_sum(a, b):
    mask = 0xFFFFFFFF                          #@mask
    while b != 0:                              #@loop
        a, b = (a ^ b) & mask, ((a & b) << 1) & mask   #@add
    return a if a <= 0x7FFFFFFF else ~(a ^ mask)   #@done
