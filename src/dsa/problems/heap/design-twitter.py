import heapq


class Twitter:
    def __init__(self):
        self.time = 0                          #@init
        self.tweets = {}                       #@tweets
        self.follows = {}                      #@follows

    def post_tweet(self, user, tweet):
        self.time += 1                         #@tick
        self.tweets.setdefault(user, []).append((self.time, tweet))   #@post

    def get_news_feed(self, user):
        people = self.follows.get(user, set()) | {user}   #@people
        heap = []                              #@heap
        for p in sorted(people):               #@seed
            posts = self.tweets.get(p, [])
            if posts:
                t, tweet = posts[-1]
                heap.append((-t, tweet, p, len(posts) - 1))
        heapq.heapify(heap)                    #@heapify
        feed = []                              #@feed
        while heap and len(feed) < 10:         #@loop
            _, tweet, p, i = heapq.heappop(heap)   #@pop
            feed.append(tweet)                 #@take
            if i > 0:                          #@more
                t, nxt = self.tweets[p][i - 1]
                heapq.heappush(heap, (-t, nxt, p, i - 1))   #@next
        return feed                            #@ret

    def follow(self, follower, followee):
        self.follows.setdefault(follower, set()).add(followee)   #@follow

    def unfollow(self, follower, followee):
        self.follows.get(follower, set()).discard(followee)   #@unfollow
