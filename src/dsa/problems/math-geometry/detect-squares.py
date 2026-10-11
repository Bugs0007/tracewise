from collections import Counter


class DetectSquares:
    def __init__(self):
        self.points = Counter()                #@init

    def add(self, point):
        self.points[tuple(point)] += 1         #@add

    def count(self, point):
        x, y = point
        total = 0                              #@total
        for (px, py), n in list(self.points.items()):   #@scan
            if abs(px - x) != abs(py - y) or px == x:   #@skip
                continue
            total += n * self.points[(x, py)] * self.points[(px, y)]   #@mul
        return total                           #@ret
