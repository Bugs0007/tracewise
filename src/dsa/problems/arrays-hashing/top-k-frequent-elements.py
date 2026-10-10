def top_k_frequent(nums, k):
    count = {}                             #@init
    for x in nums:                         #@countLoop
        count[x] = count.get(x, 0) + 1     #@count
    buckets = [[] for _ in range(len(nums) + 1)]   #@buckets
    for x, c in count.items():             #@fillLoop
        buckets[c].append(x)               #@fill
    result = []                            #@result
    for c in range(len(buckets) - 1, 0, -1):   #@scan
        for x in buckets[c]:               #@take
            result.append(x)               #@append
            if len(result) == k:           #@enough
                return result              #@return
    return result                          #@end
