def rotate(matrix):
    n = len(matrix)
    for i in range(n):                         #@transposeLoop
        for j in range(i + 1, n):
            matrix[i][j], matrix[j][i] = matrix[j][i], matrix[i][j]   #@swap
    for row in matrix:                         #@reverseLoop
        row.reverse()                          #@reverse
    return matrix                              #@done
