class MinStack:
    def __init__(self):
        self.stack = []                        #@init

    def push(self, val):
        low = min(val, self.stack[-1][1]) if self.stack else val   #@pushLow
        self.stack.append((val, low))          #@push

    def pop(self):
        self.stack.pop()                       #@pop

    def top(self):
        return self.stack[-1][0]               #@top

    def get_min(self):
        return self.stack[-1][1]               #@getMin
