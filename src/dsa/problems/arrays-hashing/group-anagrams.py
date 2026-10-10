def group_anagrams(strs):
    groups = {}                            #@init
    for word in strs:                      #@loop
        key = "".join(sorted(word))        #@key
        if key not in groups:              #@check
            groups[key] = []               #@create
        groups[key].append(word)           #@add
    return list(groups.values())           #@done
