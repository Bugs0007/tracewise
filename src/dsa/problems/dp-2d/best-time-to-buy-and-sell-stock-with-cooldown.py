def max_profit(prices):
    hold, sold, rest = float("-inf"), 0, 0     #@init
    for price in prices:                       #@loop
        prev_sold = sold
        sold = hold + price                    #@sell
        hold = max(hold, rest - price)         #@buy
        rest = max(rest, prev_sold)            #@rest
    return max(sold, rest)                     #@done
