// The master list of every concept the app must teach. Each concept maps 1:1 to a
// unit file at `src/content/units/<module>/<id>.ts`. docs/COVERAGE.md is generated
// from this list plus automated validation results (see scripts/gen-coverage.test.ts).

export type ModuleId = 'dsa' | 'backend' | 'frontend' | 'sysdesign' | 'ai' | 'cloud';

export interface ModuleMeta {
  id: ModuleId;
  code: string;
  title: string;
  blurb: string;
  accent: string;
}

export interface ConceptMeta {
  id: string;
  module: ModuleId;
  topic: string;
  title: string;
}

export const MODULES: ModuleMeta[] = [
  { id: 'dsa', code: 'M1', title: 'Data Structures & Algorithms', blurb: 'Pointers, trees, graphs, DP — watched step by step, then typed by hand.', accent: 'var(--m-dsa)' },
  { id: 'backend', code: 'M2', title: 'Backend (Python & REST)', blurb: 'Python internals, request lifecycle, ORM, transactions, auth, APIs.', accent: 'var(--m-backend)' },
  { id: 'frontend', code: 'M3', title: 'Frontend (JS, React, Next.js)', blurb: 'Event loop, closures, hooks, rendering, CSS layout, web security.', accent: 'var(--m-frontend)' },
  { id: 'sysdesign', code: 'M4', title: 'System Design (LLD & HLD)', blurb: 'SOLID, patterns, classic LLD problems, scaling and failure modes.', accent: 'var(--m-sysdesign)' },
  { id: 'ai', code: 'M5', title: 'AI Engineering', blurb: 'Tokens, embeddings, RAG, LangGraph, MCP, agents and evaluation.', accent: 'var(--m-ai)' },
  { id: 'cloud', code: 'M6', title: 'Cloud & DevOps', blurb: 'Core AWS services, CI/CD, Docker, DNS, TLS and networking.', accent: 'var(--m-cloud)' },
];

type Row = [id: string, title: string];
const group = (module: ModuleId, topic: string, rows: Row[]): ConceptMeta[] =>
  rows.map(([id, title]) => ({ id, module, topic, title }));

export const CATALOG: ConceptMeta[] = [
  // ───────────────────────── M1 DSA ─────────────────────────
  ...group('dsa', 'Arrays & Strings', [
    ['array-two-index', 'In-place array ops (two indices)'],
    ['string-reverse-words', 'String manipulation in place'],
    ['prefix-sum', 'Prefix sums'],
  ]),
  ...group('dsa', 'Linked Lists', [
    ['ll-singly', 'Singly linked list: insert & delete'],
    ['ll-doubly', 'Doubly linked list'],
    ['ll-circular', 'Circular linked list'],
    ['ll-reverse', 'Reverse a linked list'],
    ['ll-floyd', 'Cycle detection (Floyd)'],
    ['ll-merge', 'Merge two sorted lists'],
    ['ll-middle', 'Find the middle node'],
  ]),
  ...group('dsa', 'Stacks & Queues', [
    ['stack-basics', 'Stack (LIFO)'],
    ['queue-basics', 'Queue (FIFO)'],
    ['deque', 'Deque (double-ended queue)'],
    ['monotonic-stack', 'Monotonic stack'],
    ['monotonic-queue', 'Monotonic queue'],
  ]),
  ...group('dsa', 'Hashing', [
    ['hash-chaining', 'Hash map: hashing & chaining'],
    ['hash-open-addressing', 'Open addressing (linear probing)'],
    ['hash-resize', 'Hash map resizing'],
    ['hash-set', 'Hash sets for lookups'],
  ]),
  ...group('dsa', 'Trees', [
    ['tree-inorder', 'Inorder traversal'],
    ['tree-preorder', 'Preorder traversal'],
    ['tree-postorder', 'Postorder traversal'],
    ['tree-levelorder', 'Level-order traversal'],
    ['bst-insert', 'BST insert'],
    ['bst-search', 'BST search'],
    ['bst-delete', 'BST delete'],
    ['avl-rotations', 'AVL rotations'],
    ['trie', 'Trie (prefix tree)'],
    ['heap-insert', 'Heap insert (sift up)'],
    ['heap-extract', 'Heap extract (sift down)'],
    ['heapify', 'Heapify an array'],
    ['segment-tree', 'Segment tree'],
    ['fenwick-tree', 'Fenwick tree (BIT)'],
  ]),
  ...group('dsa', 'Graphs', [
    ['graph-adj-list', 'Adjacency list (directed/undirected/weighted)'],
    ['graph-adj-matrix', 'Adjacency matrix'],
    ['union-find', 'Union-Find (path compression + rank)'],
  ]),
  ...group('dsa', 'Binary Search', [
    ['binary-search', 'Binary search'],
    ['bs-first-last', 'First & last occurrence'],
    ['bs-rotated', 'Search in rotated array'],
    ['bs-on-answer', 'Binary search on the answer'],
  ]),
  ...group('dsa', 'Pointer Patterns', [
    ['two-pointers', 'Two pointers'],
    ['fast-slow', 'Fast & slow pointers'],
    ['sliding-window-fixed', 'Sliding window (fixed)'],
    ['sliding-window-variable', 'Sliding window (variable)'],
    ['kadane', "Kadane's algorithm"],
  ]),
  ...group('dsa', 'Sorting', [
    ['bubble-sort', 'Bubble sort'],
    ['selection-sort', 'Selection sort'],
    ['insertion-sort', 'Insertion sort'],
    ['merge-sort', 'Merge sort'],
    ['quick-sort', 'Quick sort (partition)'],
    ['heap-sort', 'Heap sort'],
    ['counting-sort', 'Counting sort'],
  ]),
  ...group('dsa', 'Recursion & Backtracking', [
    ['recursion-call-stack', 'Recursion: call tree & call stack'],
    ['memoization', 'Memoization (cache hits)'],
    ['subsets', 'Backtracking: subsets'],
    ['permutations', 'Backtracking: permutations'],
    ['n-queens', 'Backtracking: N-Queens'],
  ]),
  ...group('dsa', 'Dynamic Programming', [
    ['dp-climbing-stairs', 'Climbing stairs'],
    ['dp-house-robber', 'House robber'],
    ['dp-coin-change', 'Coin change'],
    ['dp-lcs', 'Longest common subsequence'],
    ['dp-edit-distance', 'Edit distance'],
    ['dp-knapsack', '0/1 knapsack'],
    ['dp-grid-paths', 'Grid paths'],
    ['dp-topdown-bottomup', 'Top-down vs bottom-up'],
  ]),
  ...group('dsa', 'Greedy', [
    ['greedy-intervals', 'Merge intervals'],
    ['greedy-activity', 'Activity selection'],
  ]),
  ...group('dsa', 'Graph Traversal', [
    ['bfs', 'Breadth-first search'],
    ['dfs', 'Depth-first search'],
    ['grid-bfs', 'BFS on a grid'],
    ['cycle-detection', 'Cycle detection'],
    ['connected-components', 'Connected components'],
    ['bipartite', 'Bipartite check'],
    ['topo-kahn', 'Topological sort (Kahn)'],
    ['topo-dfs', 'Topological sort (DFS)'],
  ]),
  ...group('dsa', 'Shortest Paths & MST', [
    ['dijkstra', "Dijkstra's algorithm"],
    ['bellman-ford', 'Bellman-Ford'],
    ['prim', "Prim's MST"],
    ['kruskal', "Kruskal's MST"],
  ]),
  ...group('dsa', 'Bits & Complexity', [
    ['bits-xor', 'XOR tricks'],
    ['bits-masks', 'Bit masks'],
    ['bits-count', 'Counting bits'],
    ['big-o', 'Big-O growth & operation counts'],
  ]),

  // ───────────────────────── M2 Backend ─────────────────────────
  ...group('backend', 'Python Essentials', [
    ['py-mutability', 'Mutability & references'],
    ['py-scope-closures', 'Scope & closures'],
    ['py-generators', 'Generators'],
    ['py-decorators', 'Decorators'],
    ['py-context-managers', 'Context managers'],
    ['py-comprehensions', 'Comprehensions'],
    ['py-args-kwargs', '*args and **kwargs'],
    ['py-dunder', 'Dunder methods'],
    ['py-gil-threading', 'GIL, threading vs processes'],
    ['py-asyncio', 'asyncio & the event loop'],
  ]),
  ...group('backend', 'Request Lifecycle', [
    ['be-request-lifecycle', 'Request/response lifecycle'],
    ['be-middleware', 'Middleware order'],
    ['be-routing', 'URL routing & views'],
  ]),
  ...group('backend', 'Models & ORM', [
    ['be-models-migrations', 'Models & migrations'],
    ['be-relations', 'Relations: FK, M2M, one-to-one'],
    ['be-orm-sql', 'ORM to SQL translation'],
    ['be-lazy-querysets', 'Lazy querysets'],
    ['be-n-plus-one', 'N+1 queries vs select/prefetch_related'],
    ['be-serializers', 'Serializers & validation'],
  ]),
  ...group('backend', 'Databases', [
    ['be-transactions', 'Transactions: commit & rollback'],
    ['be-isolation', 'Isolation levels & anomalies'],
    ['be-indexing', 'Indexes: full scan vs B-tree'],
    ['be-composite-index', 'Composite index & left-prefix rule'],
  ]),
  ...group('backend', 'Auth & Security', [
    ['be-sessions', 'Session authentication'],
    ['be-jwt', 'JWT authentication'],
    ['be-oauth2', 'OAuth2 authorization code flow'],
    ['be-password-hashing', 'Password hashing'],
    ['be-csrf', 'CSRF'],
    ['be-cors', 'CORS'],
  ]),
  ...group('backend', 'REST API Design', [
    ['be-rest-methods', 'Methods & status codes'],
    ['be-idempotency', 'Idempotency'],
    ['be-pagination', 'Pagination: offset vs cursor'],
    ['be-filtering', 'Filtering & sorting'],
    ['be-versioning', 'API versioning'],
    ['be-token-bucket', 'Rate limiting: token bucket'],
    ['be-leaky-bucket', 'Rate limiting: leaky bucket'],
    ['be-caching', 'Caching: hit/miss & invalidation'],
    ['be-errors', 'Validation & error handling'],
  ]),
  ...group('backend', 'Async Work & Testing', [
    ['be-task-queues', 'Task queues & workers'],
    ['be-retries-idempotent', 'Retries & idempotent consumers'],
    ['be-testing', 'Testing endpoints'],
  ]),

  // ───────────────────────── M3 Frontend ─────────────────────────
  ...group('frontend', 'JavaScript Core', [
    ['js-event-loop', 'Event loop: microtasks vs macrotasks'],
    ['js-closures', 'Closures'],
    ['js-hoisting', 'Hoisting & TDZ'],
    ['js-this', 'The `this` keyword'],
    ['js-prototypes', 'Prototypes'],
    ['js-promises', 'Promises & async/await ordering'],
    ['js-debounce', 'Debounce'],
    ['js-throttle', 'Throttle'],
    ['js-equality', 'Equality & coercion'],
  ]),
  ...group('frontend', 'DOM & Browser', [
    ['dom-events', 'Event capturing & bubbling'],
    ['dom-crp', 'Critical rendering path'],
    ['dom-reflow', 'Reflow vs repaint'],
  ]),
  ...group('frontend', 'React Fundamentals', [
    ['react-tree', 'Component tree, props & state'],
    ['react-rerender', 'Re-render propagation'],
    ['react-vdom', 'Virtual DOM diffing'],
    ['react-keys', 'Keys in lists'],
    ['react-controlled', 'Controlled vs uncontrolled inputs'],
    ['react-lifting-state', 'Lifting state up'],
    ['react-context', 'Context vs prop drilling'],
  ]),
  ...group('frontend', 'React Hooks', [
    ['hook-usestate', 'useState: batching & stale closures'],
    ['hook-useeffect', 'useEffect: deps & cleanup'],
    ['hook-useref', 'useRef'],
    ['hook-usememo', 'useMemo & useCallback'],
    ['hook-usereducer', 'useReducer'],
    ['hook-custom', 'Custom hooks'],
    ['hook-rules', 'Rules of hooks'],
  ]),
  ...group('frontend', 'React Performance', [
    ['react-memo', 'React.memo & unnecessary re-renders'],
    ['react-code-splitting', 'Code splitting & lazy loading'],
  ]),
  ...group('frontend', 'Next.js Concepts', [
    ['next-routing', 'File-based routing'],
    ['next-layouts', 'Layouts'],
    ['next-server-client', 'Server vs client components'],
    ['next-render-modes', 'SSR vs SSG vs ISR vs CSR'],
    ['next-data-fetching', 'Data fetching & waterfalls'],
    ['next-streaming', 'Loading, Suspense & streaming'],
    ['next-route-handlers', 'Route handlers (API)'],
    ['next-middleware', 'Middleware'],
    ['next-caching', 'Caching layers'],
    ['next-hydration', 'Hydration'],
  ]),
  ...group('frontend', 'CSS Essentials', [
    ['css-box-model', 'Box model'],
    ['css-flexbox', 'Flexbox'],
    ['css-grid', 'CSS Grid'],
    ['css-specificity', 'Specificity'],
    ['css-positioning', 'Positioning'],
  ]),
  ...group('frontend', 'Web Fundamentals', [
    ['web-http', 'HTTP request anatomy'],
    ['web-cache-headers', 'Caching headers'],
    ['web-storage', 'Cookies vs localStorage'],
    ['web-auth-browser', 'Auth in the browser'],
    ['web-xss', 'XSS'],
    ['web-csrf', 'CSRF in the browser'],
  ]),

  // ───────────────────────── M4 System Design ─────────────────────────
  ...group('sysdesign', 'OOP & SOLID', [
    ['oop-principles', 'OOP: encapsulation, inheritance, polymorphism'],
    ['solid-srp', 'Single responsibility'],
    ['solid-ocp', 'Open/closed'],
    ['solid-lsp', 'Liskov substitution'],
    ['solid-isp', 'Interface segregation'],
    ['solid-dip', 'Dependency inversion'],
    ['uml-diagrams', 'UML class diagrams'],
  ]),
  ...group('sysdesign', 'Design Patterns', [
    ['pattern-singleton', 'Singleton'],
    ['pattern-factory', 'Factory'],
    ['pattern-builder', 'Builder'],
    ['pattern-observer', 'Observer'],
    ['pattern-strategy', 'Strategy'],
    ['pattern-decorator', 'Decorator'],
    ['pattern-adapter', 'Adapter'],
    ['pattern-state', 'State'],
  ]),
  ...group('sysdesign', 'LLD Problems', [
    ['lld-parking-lot', 'Parking lot'],
    ['lld-lru-cache', 'LRU cache'],
    ['lld-rate-limiter', 'Rate limiter'],
    ['lld-elevator', 'Elevator'],
    ['lld-vending-machine', 'Vending machine'],
  ]),
  ...group('sysdesign', 'HLD Building Blocks', [
    ['hld-client-server', 'Client-server'],
    ['hld-load-balancing', 'Load balancing algorithms'],
    ['hld-consistent-hashing', 'Consistent hashing'],
    ['hld-scaling', 'Horizontal vs vertical scaling'],
    ['hld-caching-layers', 'Caching layers (CDN, app, DB)'],
    ['hld-cache-writes', 'Write-through / back / around'],
    ['hld-eviction', 'Eviction policies'],
    ['hld-replication', 'Database replication'],
    ['hld-sharding', 'Sharding'],
    ['hld-sql-nosql', 'SQL vs NoSQL'],
    ['hld-queues-pubsub', 'Message queues & pub/sub'],
    ['hld-cap', 'CAP theorem'],
    ['hld-consistency', 'Consistency models'],
    ['hld-estimation', 'Back-of-envelope estimation'],
    ['hld-api-gateway', 'API gateway'],
    ['hld-microservices', 'Microservices vs monolith'],
    ['hld-circuit-breaker', 'Circuit breaker'],
    ['hld-retries-backoff', 'Retries with exponential backoff'],
    ['hld-architect', 'Architecture builder: run traffic'],
  ]),

  // ───────────────────────── M5 AI Engineering ─────────────────────────
  ...group('ai', 'LLM Fundamentals', [
    ['ai-tokens', 'Tokens & tokenization'],
    ['ai-context-window', 'Context window'],
    ['ai-sampling', 'Temperature & top-p'],
    ['ai-embeddings', 'Embeddings & nearest neighbors'],
    ['ai-attention', 'Attention intuition'],
  ]),
  ...group('ai', 'RAG', [
    ['rag-chunking', 'Chunking strategies'],
    ['rag-embedding-index', 'Embedding & indexing'],
    ['rag-vector-search', 'Vector search'],
    ['rag-hybrid', 'Hybrid search (keyword + vector)'],
    ['rag-rerank', 'Reranking'],
    ['rag-rrf', 'Reciprocal rank fusion'],
    ['rag-hyde', 'HyDE query expansion'],
    ['rag-context-assembly', 'Context assembly & citations'],
    ['rag-evaluation', 'RAG evaluation'],
    ['rag-failures', 'RAG failure modes'],
  ]),
  ...group('ai', 'LangGraph', [
    ['lg-state-graph', 'State, nodes & edges'],
    ['lg-conditional', 'Conditional edges'],
    ['lg-reducers', 'Reducers'],
    ['lg-checkpointing', 'Checkpointing'],
    ['lg-hitl', 'Human-in-the-loop'],
  ]),
  ...group('ai', 'MCP', [
    ['mcp-roles', 'Host, client & server roles'],
    ['mcp-discovery', 'Tool/resource/prompt discovery'],
    ['mcp-tool-call', 'Tool-call lifecycle'],
    ['mcp-transports', 'Transports'],
    ['mcp-security', 'MCP security'],
  ]),
  ...group('ai', 'Agents', [
    ['agent-tool-calling', 'Tool calling'],
    ['agent-react-loop', 'ReAct loop'],
    ['agent-multi', 'Multi-agent patterns'],
    ['agent-memory', 'Agent memory'],
    ['agent-guardrails', 'Guardrails'],
  ]),
  ...group('ai', 'Production LLM Apps', [
    ['ai-prompt-patterns', 'Prompt engineering patterns'],
    ['ai-structured-output', 'Structured outputs'],
    ['ai-function-calling', 'Function calling'],
    ['ai-evaluation', 'Evaluation: golden sets & LLM-as-judge'],
    ['ai-cost-latency', 'Cost & latency tradeoffs'],
    ['ai-caching', 'Prompt & response caching'],
    ['ai-streaming', 'Streaming'],
    ['ai-ft-rag-prompt', 'Fine-tuning vs RAG vs prompting'],
  ]),

  // ───────────────────────── M6 Cloud & DevOps ─────────────────────────
  ...group('cloud', 'Compute & Storage', [
    ['aws-ec2', 'EC2'],
    ['aws-s3', 'S3'],
    ['aws-lambda', 'Lambda'],
    ['aws-rds', 'RDS'],
    ['aws-dynamodb', 'DynamoDB'],
  ]),
  ...group('cloud', 'Messaging & Integration', [
    ['aws-sqs', 'SQS'],
    ['aws-sns', 'SNS'],
    ['aws-eventbridge', 'EventBridge'],
    ['aws-api-gateway', 'API Gateway'],
  ]),
  ...group('cloud', 'Networking & Edge', [
    ['aws-cloudfront', 'CloudFront'],
    ['aws-iam', 'IAM'],
    ['aws-vpc', 'VPC basics'],
    ['aws-route53', 'Route 53'],
    ['aws-elb', 'Load balancers'],
    ['aws-autoscaling', 'Auto scaling'],
  ]),
  ...group('cloud', 'DevOps', [
    ['devops-cicd', 'CI/CD pipeline'],
    ['docker-layers', 'Docker image layers'],
    ['docker-vs-vm', 'Containers vs VMs'],
    ['docker-dockerfile', 'Dockerfile line by line'],
  ]),
  ...group('cloud', 'Linux & Networking', [
    ['linux-basics', 'Linux processes & permissions'],
    ['net-tcp', 'TCP handshake'],
    ['net-dns', 'DNS resolution'],
    ['net-tls', 'TLS handshake'],
    ['cloud-scenarios', 'Which service fits?'],
  ]),
];

export const CATALOG_BY_ID: Record<string, ConceptMeta> = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

export function topicsOf(module: ModuleId): { topic: string; concepts: ConceptMeta[] }[] {
  const out: { topic: string; concepts: ConceptMeta[] }[] = [];
  for (const c of CATALOG) {
    if (c.module !== module) continue;
    let t = out.find((x) => x.topic === c.topic);
    if (!t) out.push((t = { topic: c.topic, concepts: [] }));
    t.concepts.push(c);
  }
  return out;
}
