def product_except_self(nums):
    n = len(nums)                          #@init
    res = [1] * n                          #@res
    prefix = 1                             #@prefixInit
    for i in range(n):                     #@leftLoop
        res[i] = prefix                    #@leftSet
        prefix *= nums[i]                  #@leftGrow
    suffix = 1                             #@suffixInit
    for i in range(n - 1, -1, -1):         #@rightLoop
        res[i] *= suffix                   #@rightSet
        suffix *= nums[i]                  #@rightGrow
    return res                             #@done
