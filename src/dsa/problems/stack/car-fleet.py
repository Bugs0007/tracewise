def car_fleet(target, position, speed):
    cars = sorted(zip(position, speed), reverse=True)   #@sort
    fleets = 0                                 #@fleets
    slowest = 0.0                              #@slowest
    for pos, spd in cars:                      #@loop
        t = (target - pos) / spd               #@time
        if t > slowest:                        #@check
            fleets += 1                        #@new
            slowest = t                        #@set
    return fleets                              #@done
