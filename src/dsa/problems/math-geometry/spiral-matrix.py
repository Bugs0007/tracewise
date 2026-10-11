def spiral_order(matrix):
    result = []                                #@init
    top, bottom = 0, len(matrix) - 1           #@bounds
    left, right = 0, len(matrix[0]) - 1
    while top <= bottom and left <= right:     #@loop
        for c in range(left, right + 1):       #@topRow
            result.append(matrix[top][c])
        top += 1
        for r in range(top, bottom + 1):       #@rightCol
            result.append(matrix[r][right])
        right -= 1
        if top <= bottom:                      #@bottomCheck
            for c in range(right, left - 1, -1):   #@bottomRow
                result.append(matrix[bottom][c])
            bottom -= 1
        if left <= right:                      #@leftCheck
            for r in range(bottom, top - 1, -1):   #@leftCol
                result.append(matrix[r][left])
            left += 1
    return result                              #@done
