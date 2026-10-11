import type { Tone } from '@/engine/types';
import { chipsView, hashMapView, heapView } from '@/dsa/viz/prims';
import { MinHeap, type Watch } from '@/dsa/viz/heap';
import { TraceRecorder } from '@/dsa/viz/trace';
import { problem, vizOf } from '../helpers';
import solution from './design-twitter.py?raw';
import harness from './design-twitter.harness.py?raw';
import cases from './design-twitter.cases.json';

type Entry = [number, number, number, number]; // (−time, tweet, user, index in that user's posts)
const ARITY: Record<string, number> = { post_tweet: 2, get_news_feed: 1, follow: 2, unfollow: 2 };
const parse = (line: string): { op: string; args: number[] } => {
  const [op, ...rest] = line.trim().split(/\s+/);
  return { op, args: rest.map(Number) };
};

const viz = vizOf<{ ops: string[] }>({
  id: 'design-twitter',
  title: 'Design Twitter',
  solution,
  inputs: [{ key: 'ops', label: 'operations: post_tweet user tweet / get_news_feed user / follow a b / unfollow a b', kind: 'strings', default: ['post_tweet 1 5', 'post_tweet 2 6', 'follow 1 2', 'post_tweet 2 7', 'get_news_feed 1', 'unfollow 1 2', 'get_news_feed 1'], maxItems: 14 }],
  presets: [
    { label: 'Merge then unfollow', input: { ops: ['post_tweet 1 5', 'post_tweet 2 6', 'follow 1 2', 'post_tweet 2 7', 'get_news_feed 1', 'unfollow 1 2', 'get_news_feed 1'] } },
    { label: 'Three accounts', input: { ops: ['follow 1 2', 'follow 1 3', 'post_tweet 2 20', 'post_tweet 3 30', 'post_tweet 1 10', 'post_tweet 2 21', 'get_news_feed 1'] } },
    { label: 'Empty feed', input: { ops: ['get_news_feed 1', 'follow 1 2', 'get_news_feed 1'] } },
  ],
  validate: ({ ops }) => {
    for (const line of ops) {
      const { op, args } = parse(line);
      if (!(op in ARITY)) return `Unknown operation "${op}". Use post_tweet, get_news_feed, follow or unfollow`;
      if (args.length !== ARITY[op] || args.some((a) => !Number.isInteger(a))) return `"${op}" needs ${ARITY[op]} whole number${ARITY[op] > 1 ? 's' : ''}`;
    }
    return null;
  },
  run({ ops }) {
    const r = new TraceRecorder(solution);
    let time = 0;
    const tweets = new Map<number, [number, number][]>();
    const follows = new Map<number, Set<number>>();
    const out: (number[] | null)[] = [null];
    let heapSnap: Entry[] = [];
    let feedSoFar: number[] = [];
    let askedMerge = false;
    let askedRefill = false;
    let askedUnfollow = false;
    const show = (items: Entry[] = heapSnap, at: number[] = []) => [
      hashMapView(Object.fromEntries([...tweets.entries()].sort((a, b) => a[0] - b[0]).map(([u, ps]) => [`user ${u} tweets`, ps.map(([t, x]) => `#${x}@${t}`).join(' ')])), { title: 'tweets by user (tweet id @ time)' }),
      hashMapView(Object.fromEntries([...follows.entries()].filter(([, s]) => s.size).sort((a, b) => a[0] - b[0]).map(([u, s]) => [`user ${u} follows`, [...s].join(', ')])), { title: 'who follows whom' }),
      ...(items.length || feedSoFar.length ? [...heapView(items.map((e) => e[0]), { title: 'heap: each person’s newest unread tweet, stored as −time', tones: Object.fromEntries(at.map((i) => [i, 'active' as Tone])) }), chipsView(feedSoFar, { title: 'feed so far (newest first)' })] : []),
      chipsView(out.map((x) => (x === null ? 'None' : `[${x.join(', ')}]`)), { title: 'results of each call' }),
    ];
    const watch = (anchor: string): Watch<Entry> => (what, snap, at) => {
      heapSnap = snap;
      r.step(anchor, what === 'append' ? `Add the entry for tweet #${snap[at[0]][1]} at the end of the array.` : what === 'up' ? `Tweet #${snap[at[0]][1]} is newer than its parent’s, so it swaps upward.` : what === 'root' ? 'The last entry moves to the root and sinks down.' : `Sift down from index ${at[0]}.`, show(snap, at), {});
    };
    r.step('init', 'time orders tweets, tweets maps each user to their posts, follows maps a user to the set they follow.', show([]), {});
    for (const line of ops) {
      const { op, args } = parse(line);
      r.op();
      heapSnap = [];
      feedSoFar = [];
      if (op === 'post_tweet') {
        const [user, tweet] = args;
        time++;
        r.step('tick', `post_tweet(${user}, ${tweet}): the clock moves to ${time}.`, show(), { time });
        if (!tweets.has(user)) tweets.set(user, []);
        tweets.get(user)!.push([time, tweet]);
        out.push(null);
        r.step('post', `Record tweet #${tweet} for user ${user} at time ${time}.`, show(), {});
      } else if (op === 'follow') {
        const [a, b] = args;
        if (!follows.has(a)) follows.set(a, new Set());
        follows.get(a)!.add(b);
        out.push(null);
        r.step('follow', `User ${a} now follows ${b}.`, show(), {});
      } else if (op === 'unfollow') {
        const [a, b] = args;
        if (!askedUnfollow && follows.get(a)?.has(b)) {
          askedUnfollow = true;
          r.predict('unfollow', `User ${a} unfollows ${b}. Will ${b}'s tweets still appear in ${a}'s next feed?`, ['No', 'Yes'], 0, 'The feed is built from the user plus the set of followees, so removing the followee removes their tweets.');
        }
        follows.get(a)?.delete(b);
        out.push(null);
        r.step('unfollow', `User ${a} stops following ${b}.`, show(), {});
      } else {
        const [user] = args;
        const people = [...new Set([...(follows.get(user) ?? []), user])].sort((x, y) => x - y);
        r.step('people', `get_news_feed(${user}): the feed covers ${people.join(', ')} (the user and everyone they follow).`, show(), { people: people.join(',') });
        const heap = new MinHeap<Entry>([]);
        for (const p of people) {
          const posts = tweets.get(p) ?? [];
          if (posts.length) {
            const [t, tw] = posts[posts.length - 1];
            heap.items.push([-t, tw, p, posts.length - 1]);
          }
        }
        heapSnap = [...heap.items];
        r.step('seed', `Seed a heap with each person’s NEWEST tweet: ${heap.items.map((e) => `#${e[1]}@${-e[0]}`).join(', ') || 'none'}.`, show(), {});
        heap.heapify(watch('heapify'));
        heapSnap = [...heap.items];
        r.step('heapify', 'heapify: the newest tweet (smallest −time) is at the root.', show(heap.items, heap.size ? [0] : []), {});
        const feed: number[] = [];
        while (heap.size && feed.length < 10) {
          r.op();
          if (!askedMerge && heap.size > 1) {
            askedMerge = true;
            r.predict('merge', `Several people each offer their newest tweet. Which comes out of the heap first?`, [`#${heap.items[0][1]}, the most recent one (time ${-heap.items[0][0]})`, 'The oldest tweet', 'The tweet of the user asking'], 0, 'The root has the smallest −time, i.e. the most recent tweet overall.');
          }
          const [, tweet, p, i] = heap.pop(watch('pop'));
          feed.push(tweet);
          feedSoFar = [...feed];
          heapSnap = [...heap.items];
          r.step('take', `Take tweet #${tweet} (from user ${p}) into the feed.`, show(heap.items), { tweet });
          if (i > 0) {
            const [t, nxt] = tweets.get(p)![i - 1];
            if (!askedRefill) {
              askedRefill = true;
              r.predictChoice('refill', `Tweet #${tweet} was taken from user ${p}. Which of their tweets joins the heap now?`, `#${nxt}`, [`#${tweet}`, `#${tweets.get(p)![0][1] === nxt ? nxt + 1 : tweets.get(p)![0][1]}`, '#0'], tweet, 'Only the next older tweet of that same user is a new candidate; everyone else already has theirs in the heap.');
            }
            heap.push([-t, nxt, p, i - 1], watch('next'));
            heapSnap = [...heap.items];
            r.step('next', `Push that user’s previous tweet #${nxt}.`, show(heap.items), {});
          }
        }
        out.push(feed);
        r.step('ret', `The feed is [${feed.join(', ')}].`, show(heap.items), { result: JSON.stringify(feed) });
        feedSoFar = [];
      }
    }
    return { frames: r.frames, result: out };
  },
  reference({ ops }) {
    let t = 0;
    const posts: [number, number, number][] = [];
    const follows = new Map<number, Set<number>>();
    const out: (number[] | null)[] = [null];
    for (const line of ops) {
      const { op, args } = parse(line);
      if (op === 'post_tweet') {
        posts.push([++t, args[0], args[1]]);
        out.push(null);
      } else if (op === 'follow') {
        if (!follows.has(args[0])) follows.set(args[0], new Set());
        follows.get(args[0])!.add(args[1]);
        out.push(null);
      } else if (op === 'unfollow') {
        follows.get(args[0])?.delete(args[1]);
        out.push(null);
      } else {
        const who = new Set([...(follows.get(args[0]) ?? []), args[0]]);
        out.push(posts.filter((p) => who.has(p[1])).sort((a, b) => b[0] - a[0]).slice(0, 10).map((p) => p[2]));
      }
    }
    return out;
  },
});

export default problem({
  summary: 'Design a tiny social feed. Users can post tweets, follow and unfollow other users, and ask for a news feed: the 10 most recent tweets posted by themselves or anyone they follow, newest first.',
  example: ['user 1 posts #5; user 2 posts #6; user 1 follows 2; feed for 1', '[6, 5]', 'The newest tweet comes first. After user 1 unfollows 2, the feed is [5].'],
  pattern: ['heap', ['heap', 'design', 'sorting', 'hash-lookup'], 'Each person’s tweets are already in time order. Merging several sorted lists and taking the newest 10 is the classic job for a heap that always holds each list’s next candidate.', {
    design: 'It is a design problem, and the merge inside get_news_feed is the heap part.',
    sorting: 'Sorting every followee’s tweets on each request costs O(n log n) instead of looking at only 10.',
    'hash-lookup': 'Hash maps store tweets and follow sets, but they do not merge by time.',
  }],
  hints: [
    'Which data do you store per user, and in what order does it arrive?',
    'A feed is a merge of several time-ordered lists, newest first, stopping after 10. What helps you pick the newest among the heads of those lists?',
    'Keep a global clock. For a feed, push each person’s newest tweet into a heap (keyed by −time). Pop the best, then push that user’s next older tweet. Stop at 10.',
  ],
  insight: 'A heap holding one candidate per person turns a multi-way merge into at most 10 pops.',
  brute: 'Collect all tweets of all followees, sort, take 10: O(n log n).',
  optimal: 'Heap merge: O(f + 10 log f) per feed with f = number of people followed.',
  walk: ['Keep time, tweets per user (appended in time order), and follows per user (a set).', 'post_tweet increments time and appends (time, tweet).', 'get_news_feed seeds a heap with each person’s newest tweet, then pops up to 10 times, pushing the popped user’s next older tweet.', 'follow and unfollow modify the set.'],
  edge: ['A user with no tweets and no followees.', 'Following yourself.', 'Unfollowing someone you never followed.', 'Fewer than 10 tweets in total.'],
  works: ['The heap always contains the newest not-yet-taken tweet of every person, so the root is the newest overall.', 'Pushing the next older tweet after each pop preserves that invariant.'],
  time: ['O(f + 10 log f)', 'f people in the feed, 10 results.'],
  space: ['O(n + f)', 'All tweets plus the heap.'],
  solution,
  cases,
  sig: 'class Twitter:\n    def __init__(self):\n        pass\n\n    def post_tweet(self, user, tweet):\n        pass\n\n    def get_news_feed(self, user):\n        # return up to 10 tweet ids, newest first\n        pass\n\n    def follow(self, follower, followee):\n        pass\n\n    def unfollow(self, follower, followee):\n        pass\n',
  harness,
  viz,
  fromArgs: ([ops, args]) => ({ ops: (ops as string[]).slice(1).map((o, i) => [o, ...(args as number[][])[i + 1]].join(' ')) }),
});
