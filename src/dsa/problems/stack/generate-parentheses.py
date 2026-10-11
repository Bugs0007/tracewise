def generate_parenthesis(n):
    res = []                                   #@init

    def build(cur, opened, closed):            #@def
        if len(cur) == 2 * n:                  #@base
            res.append(cur)                    #@add
            return                             #@ret
        if opened < n:                         #@canOpen
            build(cur + "(", opened + 1, closed)   #@open
        if closed < opened:                    #@canClose
            build(cur + ")", opened, closed + 1)   #@close

    build("", 0, 0)                            #@start
    return res                                 #@done
