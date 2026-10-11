class Trie:
    def __init__(self):
        self.root = {}                         #@init

    def insert(self, word):
        node = self.root                       #@iStart
        for ch in word:                        #@iLoop
            node = node.setdefault(ch, {})     #@iStep
        node["$"] = True                       #@iEnd

    def search(self, word):
        node = self._walk(word)                #@sWalk
        return node is not None and "$" in node   #@sEnd

    def starts_with(self, prefix):
        return self._walk(prefix) is not None  #@pWalk

    def _walk(self, text):
        node = self.root                       #@wStart
        for ch in text:                        #@wLoop
            if ch not in node:                 #@wMiss
                return None                    #@wNone
            node = node[ch]                    #@wStep
        return node                            #@wEnd
