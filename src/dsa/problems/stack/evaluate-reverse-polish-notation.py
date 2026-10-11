def eval_rpn(tokens):
    stack = []                                 #@init
    for tok in tokens:                         #@loop
        if tok in ("+", "-", "*", "/"):        #@isOp
            b = stack.pop()                    #@popB
            a = stack.pop()                    #@popA
            if tok == "+":
                stack.append(a + b)            #@add
            elif tok == "-":
                stack.append(a - b)            #@sub
            elif tok == "*":
                stack.append(a * b)            #@mul
            else:
                stack.append(int(a / b))       #@div
        else:
            stack.append(int(tok))             #@push
    return stack[0]                            #@done
