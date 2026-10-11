from collections import deque


def find_order(num_courses, prerequisites):
    graph = [[] for _ in range(num_courses)]   #@graph
    indegree = [0] * num_courses               #@indegree
    for course, pre in prerequisites:          #@edges
        graph[pre].append(course)
        indegree[course] += 1
    queue = deque(i for i in range(num_courses) if indegree[i] == 0)   #@seed
    order = []                                 #@order
    while queue:                               #@loop
        cur = queue.popleft()                  #@pop
        order.append(cur)                      #@take
        for nxt in graph[cur]:                 #@next
            indegree[nxt] -= 1                 #@dec
            if indegree[nxt] == 0:             #@zero
                queue.append(nxt)              #@push
    return order if len(order) == num_courses else []   #@done
