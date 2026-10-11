def max_profit(prices):
    lowest = float("inf")                      #@init
    best = 0                                   #@best
    for p in prices:                           #@loop
        if p < lowest:                         #@isLow
            lowest = p                         #@newLow
        elif p - lowest > best:                #@isBetter
            best = p - lowest                  #@update
    return best                                #@done
