import heapq


class MedianFinder:
    def __init__(self):
        self.low = []                          #@init
        self.high = []                         #@high

    def add_num(self, num):
        heapq.heappush(self.low, -num)         #@pushLow
        heapq.heappush(self.high, -heapq.heappop(self.low))   #@move
        if len(self.high) > len(self.low):     #@balance
            heapq.heappush(self.low, -heapq.heappop(self.high))   #@back

    def find_median(self):
        if len(self.low) > len(self.high):     #@odd
            return float(-self.low[0])         #@oddRet
        return (-self.low[0] + self.high[0]) / 2   #@even
