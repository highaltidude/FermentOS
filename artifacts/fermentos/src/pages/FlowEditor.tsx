import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type MouseEvent } from "react";
import { Link, useLocation, useRoute } from "wouter";
import {
  Background,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, ArrowLeft, Loader2, Monitor, Play, Save, X } from "lucide-react";
import {
  useGetFlow,
  getGetFlowQueryKey,
  useCreateFlow,
  useUpdateFlow,
  useEnableFlow,
  useDisableFlow,
  useRunFlow,
  useGetFlowStatus,
  getGetFlowStatusQueryKey,
  useListFlowRuns,
  getListFlowRunsQueryKey,
  getListFlowsQueryKey,
  useListOutputDevices,
  getListOutputDevicesQueryKey,
  useListSensorDevices,
  useListRecipes,
  type Flow,
  type FlowGraph,
  type FlowGraphNodeType,
  type FlowProblem,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { FlowStatusLine } from "@/components/flows/FlowStatusLine";
import {
  CATEGORY_STYLES, FlowCanvasContext, NODE_ICONS, nodeTypes, type FlowCanvasInfo, type FlowCanvasNode,
} from "@/components/flows/FlowNodeCard";
import { NodeInspector } from "@/components/flows/NodeInspector";
import { useToast } from "@/hooks/use-toast";
import { useFermentTempUnit } from "@/hooks/useFermentTempUnit";
import {
  NODE_HINTS, NODE_LABELS, PALETTE, allowedInKind, connectionProblem, defaultConfig, flowKindOf, hasInput, hasOutput, nodeCategory,
  type GraphKind,
} from "@/lib/flows";
import { cn } from "@/lib/utils";
import { formatShortDateTime } from "./settings/system/integrations/ispindelFormat";
import { apiError } from "./Flows";

const DRAG_TYPE = "application/x-fermentos-flow-node";
const NODE_WIDTH = 240;
const EDGE_STYLE = { type: "smoothstep", markerEnd: { type: MarkerType.ArrowClosed } } as const;
const EMPTY_GRAPH: FlowGraph = { version: 1, nodes: [], edges: [] };

function useIsDesktop() {
  const query = "(min-width: 768px)";
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return matches;
}

function toCanvas(graph: FlowGraph): { nodes: FlowCanvasNode[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ id: n.id, type: n.type, position: n.position, data: { config: { ...n.data.config } } })),
    edges: graph.edges.map((e) => ({ id: e.id, source: e.source, target: e.target, ...EDGE_STYLE })),
  };
}

function toGraph(nodes: FlowCanvasNode[], edges: Edge[]): FlowGraph {
  return {
    version: 1,
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as FlowGraphNodeType,
      position: { x: Math.round(n.position.x), y: Math.round(n.position.y) },
      data: { config: n.data.config },
    })),
    edges: edges.map((e) => ({ id: e.id, source: e.source, target: e.target })),
  };
}

const snapshot = (name: string, description: string, graph: FlowGraph, recipeIds: number[]) =>
  JSON.stringify({ name: name.trim(), description: description.trim(), graph, recipeIds: [...recipeIds].sort() });

function newNodeId(type: FlowGraphNodeType, nodes: FlowCanvasNode[]): string {
  const base = type.split(".")[1]!.toLowerCase();
  for (;;) {
    const id = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    if (!nodes.some((n) => n.id === id)) return id;
  }
}

export default function FlowEditor() {
  const [isNew] = useRoute("/flows/new");
  const [, params] = useRoute("/flows/:id");
  const id = isNew ? null : Number(params?.id);
  const valid = id === null || (Number.isInteger(id) && id > 0);
  const { data: flow, isLoading } = useGetFlow(id ?? 0, {
    query: { enabled: id !== null && valid, queryKey: getGetFlowQueryKey(id ?? 0) },
  });

  if (id !== null && isLoading) {
    return <div className="flex justify-center py-16"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!valid || (id !== null && !flow)) {
    return (
      <div className="p-6 max-w-xl mx-auto text-sm text-muted-foreground">
        That flow doesn't exist. <Link href="/flows" className="text-primary underline underline-offset-2">Back to Brew Flows</Link>
      </div>
    );
  }
  return (
    <ReactFlowProvider key={id ?? "new"}>
      <Editor flow={flow ?? null} />
    </ReactFlowProvider>
  );
}

function Editor({ flow }: { flow: Flow | null }) {
  const desktop = useIsDesktop();
  const readOnly = !desktop;
  const { toast } = useToast();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const unit = useFermentTempUnit();
  const { screenToFlowPosition } = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const { data: devices = [] } = useListOutputDevices({ query: { queryKey: getListOutputDevicesQueryKey() } });
  const { data: sensors = [] } = useListSensorDevices();

  // The canvas owns the graph while editing; `flow` only seeds it.
  const [initial] = useState(() => toCanvas(flow?.graph ?? EMPTY_GRAPH));
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowCanvasNode>(initial.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(initial.edges);
  const [name, setName] = useState(flow?.name ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [recipeIds, setRecipeIds] = useState<number[]>(flow?.recipeIds ?? []);
  const [problems, setProblems] = useState<FlowProblem[]>(flow?.problems ?? []);
  const [saved, setSaved] = useState(() =>
    snapshot(flow?.name ?? "", flow?.description ?? "", toGraph(initial.nodes, initial.edges), flow?.recipeIds ?? []));
  const { data: recipes = [] } = useListRecipes({});

  const graph = useMemo(() => toGraph(nodes, edges), [nodes, edges]);
  const dirty = snapshot(name, description, graph, recipeIds) !== saved;
  const kind = flowKindOf(graph);
  const hasTrigger = graph.nodes.some((n) => nodeCategory(n.type) === "trigger");
  const selected = nodes.filter((n) => n.selected);
  const selectedNode = selected.length === 1 ? selected[0]! : null;

  const enabled = flow?.enabled ?? false;
  const { data: status } = useGetFlowStatus(flow?.id ?? 0, {
    query: { enabled: enabled, refetchInterval: 10_000, queryKey: getGetFlowStatusQueryKey(flow?.id ?? 0) },
  });
  const runsParams = { limit: 20 };
  const { data: runs = [] } = useListFlowRuns(flow?.id ?? 0, runsParams, {
    query: { enabled: flow !== null, refetchInterval: 15_000, queryKey: getListFlowRunsQueryKey(flow?.id ?? 0, runsParams) },
  });

  const problemsByNode = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of problems) {
      if (!p.nodeId) continue;
      // Config problems arrive as "Schedule: …" for the list page; on the step itself the label is redundant.
      const type = graph.nodes.find((n) => n.id === p.nodeId)?.type;
      const prefix = type ? `${NODE_LABELS[type]}: ` : "";
      const message = prefix && p.message.startsWith(prefix) ? p.message.slice(prefix.length) : p.message;
      map.set(p.nodeId, [...(map.get(p.nodeId) ?? []), message]);
    }
    return map;
  }, [problems, graph]);
  const flowProblems = problems.filter((p) => !p.nodeId || !graph.nodes.some((n) => n.id === p.nodeId));

  const live = enabled && status?.running ? status.nodes : null;
  const canvasInfo = useMemo<FlowCanvasInfo>(
    () => ({ devices, sensors, unit, live, tempC: status?.tempC ?? null, problems: problemsByNode }),
    [devices, sensors, unit, live, status?.tempC, problemsByNode],
  );
  // Edges into a step that was reached on the last check animate, so the live path stands out.
  const shownEdges = useMemo(
    () => edges.map((e) => (live?.[e.target]?.active ? { ...e, animated: true, style: { stroke: "rgb(34 197 94)" } } : e)),
    [edges, live],
  );

  // Leaving with unsaved edits loses them; the browser asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const refresh = (id: number) => {
    qc.invalidateQueries({ queryKey: getGetFlowQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListFlowsQueryKey() });
    qc.invalidateQueries({ queryKey: getGetFlowStatusQueryKey(id) });
    qc.invalidateQueries({ queryKey: getListFlowRunsQueryKey(id, runsParams) });
    qc.invalidateQueries({ queryKey: getListOutputDevicesQueryKey() });
  };
  const problemsFrom = (err: unknown) => (err as { data?: { problems?: FlowProblem[] } } | null)?.data?.problems;

  const create = useCreateFlow();
  const update = useUpdateFlow();
  const enable = useEnableFlow();
  const disable = useDisableFlow();
  const run = useRunFlow();
  const saving = create.isPending || update.isPending;

  const save = async () => {
    const body = { name: name.trim() || "Untitled flow", description: description.trim() || null, graph, recipeIds };
    try {
      const result = flow ? await update.mutateAsync({ id: flow.id, data: body }) : await create.mutateAsync({ data: body });
      setName(body.name);
      setProblems(result.problems);
      setSaved(snapshot(body.name, description, graph, recipeIds));
      qc.setQueryData(getGetFlowQueryKey(result.id), result);
      refresh(result.id);
      toast(result.problems.length > 0
        ? { title: "Saved", description: `Fix the highlighted step${result.problems.length > 1 ? "s" : ""} before turning it on.` }
        : { title: "Saved" });
      if (!flow) navigate(`/flows/${result.id}`, { replace: true });
    } catch (err) {
      const p = problemsFrom(err);
      if (p) setProblems(p);
      toast({ title: "Couldn't save the flow", description: apiError(err), variant: "destructive" });
    }
  };
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [readOnly]);

  const toggle = async () => {
    if (!flow) return;
    try {
      if (flow.enabled) await disable.mutateAsync({ id: flow.id });
      else {
        const result = await enable.mutateAsync({ id: flow.id });
        setProblems(result.problems);
      }
    } catch (err) {
      const p = problemsFrom(err);
      if (p) setProblems(p);
      toast({ title: flow.enabled ? "Couldn't turn the flow off" : "Couldn't turn the flow on", description: apiError(err), variant: "destructive" });
    }
    refresh(flow.id);
  };

  const onConnect = useCallback((c: Connection) => {
    const why = connectionProblem(graph, c.source, c.target);
    if (why) {
      toast({ title: "Can't connect those steps", description: why });
      return;
    }
    setEdges((es) => [...es, { id: `${c.source}-${c.target}`, source: c.source, target: c.target, ...EDGE_STYLE }]);
  }, [graph, setEdges, toast]);

  /** Adds a step at `position`, or under the selected step (joined to it) when there's no position. */
  const addNode = (type: FlowGraphNodeType, position?: { x: number; y: number }) => {
    const id = newNodeId(type, nodes);
    let link: string | null = null;
    let pos = position;
    if (!pos) {
      if (selectedNode && hasOutput(selectedNode.type as FlowGraphNodeType) && hasInput(type)) {
        const siblings = edges.filter((e) => e.source === selectedNode.id).length;
        pos = { x: selectedNode.position.x + siblings * (NODE_WIDTH + 30), y: selectedNode.position.y + 150 };
        link = selectedNode.id;
      } else {
        const rect = wrapper.current!.getBoundingClientRect();
        const center = screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 3 });
        pos = { x: center.x - NODE_WIDTH / 2, y: center.y };
      }
    }
    const kindAfter: GraphKind | null = type === "trigger.schedule" ? "schedule" : type === "trigger.temperature" ? "temperature" : kind;
    const node: FlowCanvasNode = { id, type, position: pos, data: { config: defaultConfig(type, unit, kindAfter) }, selected: true };
    setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), node]);
    if (link) setEdges((es) => [...es, { id: `${link}-${id}`, source: link, target: id, ...EDGE_STYLE }]);
  };

  const onDrop = (e: DragEvent) => {
    const type = e.dataTransfer.getData(DRAG_TYPE) as FlowGraphNodeType;
    if (!type || !(type in NODE_LABELS)) return;
    e.preventDefault();
    const p = screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(type, { x: p.x - NODE_WIDTH / 2, y: p.y - 20 });
  };

  const updateConfig = (id: string, config: Record<string, unknown>) =>
    setNodes((ns) => ns.map((n) => (n.id === id ? { ...n, data: { config } } : n)));
  const deleteNode = (id: string) => {
    setNodes((ns) => ns.filter((n) => n.id !== id));
    setEdges((es) => es.filter((e) => e.source !== id && e.target !== id));
  };

  const leave = (e: MouseEvent) => {
    if (dirty && !confirm("Leave without saving your changes?")) e.preventDefault();
  };

  const activity = (
    <div>
      <p className="text-xs font-medium text-muted-foreground mb-1.5">Recent activity</p>
      {runs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing yet.</p>
      ) : (
        <ul className="space-y-1">
          {runs.map((r) => (
            <li key={r.id} className="text-xs">
              <span className="text-muted-foreground mr-2">{formatShortDateTime(r.startedAt)}</span>
              <span className={cn(r.status === "failsafe" || r.status === "error" ? "text-destructive" : r.status === "skipped" ? "text-muted-foreground" : "text-foreground")}>
                {r.message}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <div className="flex flex-col md:h-screen">
      {/* Header */}
      {/* md:pr-16 keeps Save clear of the floating theme toggle. */}
      <div className="px-4 md:pr-16 py-3 border-b border-border flex flex-wrap items-center gap-x-3 gap-y-2 bg-background">
        <Link href="/flows" onClick={leave} className="text-muted-foreground hover:text-foreground" title="Back to Brew Flows">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        {readOnly ? (
          <h1 className="text-base font-semibold text-foreground flex-1 min-w-0 truncate">{name || "New flow"}</h1>
        ) : (
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name this flow"
            maxLength={100}
            className="h-8 text-sm font-semibold max-w-xs"
          />
        )}
        <div className="text-xs text-muted-foreground min-w-0">
          {enabled && <FlowStatusLine status={status} unit={unit} />}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {flow && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {enabled ? "On" : "Off"}
              <Switch
                checked={enabled}
                disabled={enable.isPending || disable.isPending || (dirty && !enabled)}
                title={dirty && !enabled ? "Save your changes first" : enabled ? "Turn off" : "Turn on"}
                onChange={toggle}
              />
            </label>
          )}
          {enabled && flow?.kind === "schedule" && (
            <Button
              size="sm"
              variant="outline"
              disabled={run.isPending}
              onClick={() => run.mutate({ id: flow.id }, {
                onSuccess: () => { toast({ title: "Flow started" }); setTimeout(() => refresh(flow.id), 1500); },
                onError: (err) => toast({ title: "Couldn't run the flow", description: apiError(err), variant: "destructive" }),
              })}
            >
              <Play className="w-3.5 h-3.5" />Run now
            </Button>
          )}
          {!readOnly && (
            <Button size="sm" onClick={save} disabled={saving || (!dirty && flow !== null)} title="Save (Ctrl+S)">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              {dirty || !flow ? "Save" : "Saved"}
            </Button>
          )}
        </div>
      </div>

      {flowProblems.length > 0 && (
        <div className="px-4 py-2 border-b border-border bg-amber-500/10 space-y-0.5">
          {flowProblems.map((p, i) => (
            <p key={i} className="text-xs text-amber-700 dark:text-amber-400 flex items-start gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />{p.message}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        {/* Palette */}
        {!readOnly && (
          <aside className="w-52 shrink-0 border-r border-border overflow-y-auto p-3 space-y-4 bg-background">
            {PALETTE.map((group) => (
              <div key={group.category}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">{group.label}</p>
                <div className="space-y-1">
                  {group.types.map((type) => {
                    const Icon = NODE_ICONS[type];
                    const blocked = group.category === "trigger" && hasTrigger
                      ? "A flow has one trigger; delete the current one first"
                      : !allowedInKind(type, kind)
                        ? `Not available in a ${kind} flow`
                        : null;
                    return (
                      <button
                        key={type}
                        type="button"
                        draggable={!blocked}
                        disabled={!!blocked}
                        onDragStart={(e) => { e.dataTransfer.setData(DRAG_TYPE, type); e.dataTransfer.effectAllowed = "move"; }}
                        onClick={() => addNode(type)}
                        title={blocked ?? `${NODE_HINTS[type]} Click to add${selectedNode ? " under the selected step" : ""}, or drag onto the canvas.`}
                        className="w-full flex items-center gap-2 rounded-md border border-border bg-card px-2 py-1.5 text-left text-sm hover:bg-muted/60 disabled:opacity-40 disabled:hover:bg-card cursor-grab disabled:cursor-not-allowed"
                      >
                        <Icon className={cn("w-3.5 h-3.5 shrink-0", CATEGORY_STYLES[group.category].icon)} />
                        {NODE_LABELS[type]}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Drag from a step's bottom dot to another step's top dot to join them. Select a step or a line and press Delete to remove it.
            </p>
          </aside>
        )}

        {/* Canvas */}
        <div
          ref={wrapper}
          className="flex-1 relative h-[60vh] md:h-auto"
          onDragOver={(e) => { if (e.dataTransfer.types.includes(DRAG_TYPE)) { e.preventDefault(); e.dataTransfer.dropEffect = "move"; } }}
          onDrop={onDrop}
        >
          <FlowCanvasContext.Provider value={canvasInfo}>
            <ReactFlow<FlowCanvasNode, Edge>
              nodes={nodes}
              edges={shownEdges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              nodesDraggable={!readOnly}
              nodesConnectable={!readOnly}
              deleteKeyCode={readOnly ? null : ["Backspace", "Delete"]}
              fitView
              fitViewOptions={{ padding: 0.25, maxZoom: 1 }}
              minZoom={0.3}
              maxZoom={1.5}
            >
              <Background gap={16} />
              <Controls showInteractive={false} />
            </ReactFlow>
          </FlowCanvasContext.Provider>
          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <p className="text-sm text-muted-foreground max-w-xs text-center">
                Start with a trigger from the left: <strong>Temperature</strong> to hold a temperature, or <strong>Schedule</strong> to run at set times.
              </p>
            </div>
          )}
        </div>

        {/* Inspector */}
        {!readOnly && (
          <aside className="w-80 shrink-0 border-l border-border overflow-y-auto p-4 space-y-5 bg-background">
            {selectedNode ? (
              <NodeInspector
                key={selectedNode.id}
                id={selectedNode.id}
                type={selectedNode.type as FlowGraphNodeType}
                config={selectedNode.data.config}
                onChange={(config) => updateConfig(selectedNode.id, config)}
                onDelete={() => deleteNode(selectedNode.id)}
                kind={kind}
                unit={unit}
                devices={devices}
                sensors={sensors}
                flowId={flow?.id ?? null}
                problems={problemsByNode.get(selectedNode.id) ?? []}
                readOnly={readOnly}
              />
            ) : (
              <>
                <div className="space-y-3">
                  <p className="text-sm font-semibold">Flow</p>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Notes</label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="text-sm" placeholder="What this flow is for" />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">Recipes</label>
                    {recipeIds.length > 0 && (
                      <div className="flex flex-wrap gap-1 mb-1.5">
                        {recipeIds.map((rid) => (
                          <span key={rid} className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-xs">
                            {recipes.find((r) => r.id === rid)?.name ?? `Recipe ${rid}`}
                            <button type="button" onClick={() => setRecipeIds((ids) => ids.filter((x) => x !== rid))} title="Unlink" className="text-muted-foreground hover:text-destructive">
                              <X className="w-3 h-3" />
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    <select
                      className="w-full text-sm bg-background border border-border rounded-md px-2 h-8 text-foreground"
                      value=""
                      onChange={(e) => { const v = Number(e.target.value); if (v) setRecipeIds((ids) => [...ids, v]); }}
                      disabled={kind === "schedule"}
                    >
                      <option value="">{kind === "schedule" ? "Schedule flows can't follow a recipe" : "Link a recipe…"}</option>
                      {recipes.filter((r) => !recipeIds.includes(r.id)).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      {recipeIds.length > 0
                        ? "Runs only while a brew of one of these recipes is on the sensor; otherwise it stands by with its relays off."
                        : "Not linked: runs for whatever brew is on the sensor."}
                    </p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {kind === "temperature"
                      ? "Checked every 30 seconds. Relays below a step that isn't reached are switched off."
                      : kind === "schedule"
                        ? "Runs top to bottom each time the schedule fires. Branches run side by side."
                        : "Add a trigger to start."}{" "}
                    Select a step to change it.
                  </p>
                  {flow && !enabled && !dirty && problems.length === 0 && (
                    <p className="text-xs text-muted-foreground">Ready. Turn it on with the switch at the top.</p>
                  )}
                </div>
                {flow && activity}
              </>
            )}
          </aside>
        )}
      </div>

      {readOnly && (
        <div className="p-4 space-y-4">
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Monitor className="w-3.5 h-3.5 shrink-0 mt-px" />
            {flow ? "To change the steps, open this flow on a larger screen. You can still turn it on or off here." : "Build flows on a larger screen."}
          </p>
          {flow?.description && <p className="text-sm text-foreground">{flow.description}</p>}
          {flow && activity}
        </div>
      )}
    </div>
  );
}
