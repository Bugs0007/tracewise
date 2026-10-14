def search(nums, target):
    lo, hi = 0, len(nums) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1

assert search([-8,-3,2,7,12,19,25,31],19)==5
assert search([-8,-3,2,7,12,19,25,31],5)==-1
assert search([-8,-3,2,7,12,19,25,31],-8)==0
assert search([-8,-3,2,7,12,19,25,31],31)==7
assert search([4],4)==0
assert search([],1)==-1
print("Six displayed-code cases passed.")
