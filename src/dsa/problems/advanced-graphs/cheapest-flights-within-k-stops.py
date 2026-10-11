def find_cheapest_price(n, flights, src, dst, k):
    INF = float("inf")
    prices = [INF] * n                         #@init
    prices[src] = 0
    for _ in range(k + 1):                     #@round
        nxt = prices[:]                        #@copy
        for u, v, w in flights:                #@scan
            if prices[u] + w < nxt[v]:         #@check
                nxt[v] = prices[u] + w         #@relax
        prices = nxt                           #@swap
    return -1 if prices[dst] == INF else prices[dst]   #@done
