class TimeMap:
    def __init__(self):
        self.data = {}                         #@init

    def set(self, key, value, timestamp):
        self.data.setdefault(key, []).append((timestamp, value))   #@set

    def get(self, key, timestamp):
        items = self.data.get(key, [])         #@items
        lo, hi = 0, len(items) - 1             #@bounds
        ans = ""                               #@ans
        while lo <= hi:                        #@loop
            mid = (lo + hi) // 2               #@mid
            if items[mid][0] <= timestamp:     #@cmp
                ans = items[mid][1]            #@take
                lo = mid + 1                   #@goRight
            else:
                hi = mid - 1                   #@goLeft
        return ans                             #@done
