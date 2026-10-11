def search_matrix(matrix, target):
    if not matrix or not matrix[0]:            #@guard
        return False                           #@guardRet
    rows, cols = len(matrix), len(matrix[0])   #@dims
    lo, hi = 0, rows * cols - 1                #@init
    while lo <= hi:                            #@loop
        mid = (lo + hi) // 2                   #@mid
        val = matrix[mid // cols][mid % cols]  #@val
        if val == target:                      #@eq
            return True                        #@found
        if val < target:                       #@less
            lo = mid + 1                       #@goRight
        else:
            hi = mid - 1                       #@goLeft
    return False                               #@miss
