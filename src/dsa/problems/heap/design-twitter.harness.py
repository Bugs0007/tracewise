# Replays a list of operations on the class. ops[0] is the class name and args[0] its constructor arguments;
# the result holds one entry per operation (None for the constructor and for methods that return nothing).
def adapter(fn, ops, args):
    obj = fn(*args[0])
    out = [None]
    for op, a in zip(ops[1:], args[1:]):
        out.append(getattr(obj, op)(*a))
    return out
