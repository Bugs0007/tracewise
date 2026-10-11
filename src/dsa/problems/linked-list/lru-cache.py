class Node:
    def __init__(self, key=0, val=0):
        self.key, self.val = key, val
        self.prev = self.next = None


class LRUCache:
    def __init__(self, capacity):
        self.cap = capacity                    #@init
        self.map = {}                          #@map
        self.head, self.tail = Node(), Node()  #@sentinels
        self.head.next, self.tail.prev = self.tail, self.head   #@link

    def _remove(self, node):
        node.prev.next, node.next.prev = node.next, node.prev   #@remove

    def _add_front(self, node):
        node.next, node.prev = self.head.next, self.head        #@addSet
        self.head.next.prev = node             #@addA
        self.head.next = node                  #@addB

    def get(self, key):
        if key not in self.map:                #@getMiss
            return -1                          #@getMissRet
        node = self.map[key]                   #@getNode
        self._remove(node)                     #@getRemove
        self._add_front(node)                  #@getFront
        return node.val                        #@getVal

    def put(self, key, value):
        if key in self.map:                    #@putHas
            self._remove(self.map[key])        #@putRemove
        node = Node(key, value)                #@putNode
        self.map[key] = node                   #@putMap
        self._add_front(node)                  #@putFront
        if len(self.map) > self.cap:           #@evictCheck
            lru = self.tail.prev               #@evictPick
            self._remove(lru)                  #@evictRemove
            del self.map[lru.key]              #@evictDel
