def encode(strs):
    out = []                               #@eInit
    for s in strs:                         #@eLoop
        out.append(str(len(s)) + "#" + s)  #@eAppend
    return "".join(out)                    #@eReturn


def decode(s):
    result = []                            #@dInit
    i = 0                                  #@dStart
    while i < len(s):                      #@dLoop
        j = s.index("#", i)                #@dFind
        length = int(s[i:j])               #@dLen
        result.append(s[j + 1 : j + 1 + length])   #@dSlice
        i = j + 1 + length                 #@dNext
    return result                          #@dReturn
