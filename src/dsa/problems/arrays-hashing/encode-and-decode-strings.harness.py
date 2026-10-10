# Round trip: the tests call encode(strs) through this adapter, which decodes the result again.
def adapter(fn, strs):
    return decode(fn(strs))
