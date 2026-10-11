def multiply(num1, num2):
    if num1 == "0" or num2 == "0":             #@zero
        return "0"                             #@zeroRet
    digits = [0] * (len(num1) + len(num2))     #@init
    for i in range(len(num1) - 1, -1, -1):     #@outer
        for j in range(len(num2) - 1, -1, -1): #@inner
            total = int(num1[i]) * int(num2[j]) + digits[i + j + 1]   #@mulAdd
            digits[i + j + 1] = total % 10     #@low
            digits[i + j] += total // 10       #@carry
    return "".join(map(str, digits)).lstrip("0")   #@done
