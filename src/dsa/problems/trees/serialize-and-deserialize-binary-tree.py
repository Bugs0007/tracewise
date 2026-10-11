class Codec:
    def serialize(self, root):
        out = []                               #@sInit

        def walk(node):                        #@sDef
            if node is None:                   #@sBase
                out.append("#")                #@sNone
                return                         #@sRet
            out.append(str(node.val))          #@sVal
            walk(node.left)                    #@sLeft
            walk(node.right)                   #@sRight

        walk(root)                             #@sStart
        return ",".join(out)                   #@sJoin

    def deserialize(self, data):
        tokens = iter(data.split(","))         #@dInit

        def build():                           #@dDef
            tok = next(tokens)                 #@dNext
            if tok == "#":                     #@dIsNone
                return None                    #@dNone
            node = TreeNode(int(tok))          #@dMake
            node.left = build()                #@dLeft
            node.right = build()               #@dRight
            return node                        #@dRet

        return build()                         #@dStart
