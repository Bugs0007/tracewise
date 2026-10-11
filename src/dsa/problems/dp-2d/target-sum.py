def find_target_sum_ways(nums, target):
    ways = {0: 1}                              #@init
    for x in nums:                             #@loop
        nxt = {}                               #@nxt
        for total, count in ways.items():      #@items
            nxt[total + x] = nxt.get(total + x, 0) + count   #@plus
            nxt[total - x] = nxt.get(total - x, 0) + count   #@minus
        ways = nxt                             #@swap
    return ways.get(target, 0)                 #@done
