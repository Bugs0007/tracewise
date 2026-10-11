def reverse(x):
    sign = -1 if x < 0 else 1                  #@sign
    x = abs(x)
    result = 0                                 #@init
    while x:                                   #@loop
        result = result * 10 + x % 10          #@push
        x //= 10                               #@pop
    result *= sign                             #@apply
    return result if -2**31 <= result <= 2**31 - 1 else 0   #@done
