def can_complete_circuit(gas, cost):
    if sum(gas) < sum(cost):                   #@total
        return -1                              #@totalRet
    start = tank = 0                           #@init
    for i in range(len(gas)):                  #@loop
        tank += gas[i] - cost[i]               #@tank
        if tank < 0:                           #@fail
            start = i + 1                      #@restart
            tank = 0
    return start                               #@done
