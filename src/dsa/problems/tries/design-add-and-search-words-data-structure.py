class WordDictionary:
    def __init__(self):
        self.root = {}                         #@init

    def add_word(self, word):
        node = self.root                       #@aStart
        for ch in word:                        #@aLoop
            node = node.setdefault(ch, {})     #@aStep
        node["$"] = True                       #@aEnd

    def search(self, word):
        def dfs(i, node):                      #@dDef
            if i == len(word):                 #@dEnd
                return "$" in node             #@dEndRet
            ch = word[i]                       #@dChar
            if ch == ".":                      #@dDot
                return any(dfs(i + 1, child) for key, child in node.items() if key != "$")   #@dTry
            if ch not in node:                 #@dMiss
                return False                   #@dMissRet
            return dfs(i + 1, node[ch])        #@dNext

        return dfs(0, self.root)               #@sStart
