PHONE = {"2": "abc", "3": "def", "4": "ghi", "5": "jkl", "6": "mno", "7": "pqrs", "8": "tuv", "9": "wxyz"}


def letter_combinations(digits):
    if not digits:                             #@empty
        return []                              #@emptyRet
    res = []                                   #@init
    path = []                                  #@path

    def dfs(i):                                #@def
        if i == len(digits):                   #@full
            res.append("".join(path))          #@record
            return                             #@fullRet
        for ch in PHONE[digits[i]]:            #@loop
            path.append(ch)                    #@choose
            dfs(i + 1)                         #@explore
            path.pop()                         #@undo

    dfs(0)                                     #@start
    return res                                 #@done
