def is_happy(n):
    def step(x):
        return sum(int(d) ** 2 for d in str(x))   #@step

    slow, fast = n, step(n)                    #@init
    while fast != 1 and slow != fast:          #@loop
        slow = step(slow)                      #@slow
        fast = step(step(fast))                #@fast
    return fast == 1                           #@done
