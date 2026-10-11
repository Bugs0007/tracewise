START = "SFO"


def find_itinerary(tickets):
    graph = {}                                 #@graph
    for src, dst in tickets:
        graph.setdefault(src, []).append(dst)
    for src in graph:
        graph[src].sort(reverse=True)          #@sort
    route = []                                 #@route

    def visit(city):                           #@def
        while graph.get(city):                 #@loop
            visit(graph[city].pop())           #@recurse
        route.append(city)                     #@append

    visit(START)                               #@start
    return route[::-1]                         #@done
