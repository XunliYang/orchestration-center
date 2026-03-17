import AgentNode from "@/components/orchestration_center/workflowEditor/CustomNodes/AgentNode/index.jsx";
import {EndNode, StartNode} from "@/components/orchestration_center/workflowEditor/CustomNodes/CircleNode/index.jsx";
import {SmartStepEdge} from "@tisoap/react-flow-smart-edge";
import FloatingEdge from "@/components/orchestration_center/workflowEditor/CustomEdges/FloatingEdge/index.jsx";
import {useTranslation} from "react-i18next";
import {
    addEdge,
    MarkerType,
    ReactFlow,
    useEdgesState,
    useNodesState,
    useReactFlow,
    Controls,
    Background, ReactFlowProvider
} from "@xyflow/react";
import {useCallback, useEffect, useState} from "react";


const nodeTypes = {
    agentNode: AgentNode,
    startNode: StartNode,
    endNode: EndNode,
}

const edgeTypes = {
    smart: SmartStepEdge,
    floating: FloatingEdge,
}

const initialNodes = [
    {
        id: "startNode",
        type: 'startNode',
        position: {x: 400, y: 50},
        data: {description: 'this is the start node', name: 'start_node', status: 'start_event'}
    },
    {
        id: "endNode",
        type: 'endNode',
        position: {x: 400, y: 60},
        data: {description: 'this is the end node', name: 'start_node', status: 'end_event'}
    }
];

const FlowInner = ({onCancel, isDark, importedNodes, importedEdges}) => {
    const {t, i18n} = useTranslation();
    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const [selectedElement, setSelectedElement] = useState(null);
    const [rfInstance, setRfInstance] = useState(null);
    const [phenomenon, setPhenomenon] = useState("");

    const {screenToFlowPosition, fitView} = useReactFlow();
    useEffect(() => {
        if (importedNodes && importedNodes.length > 0) {
            const initNodes = importedNodes.map(node => ({...node, data: {...node.data, isDark}}));
            setNodes(initNodes);
        }
    }, [importedNodes, setNodes, isDark]);

    useEffect(() => {
        if (importedEdges) {
            const initEdges = importedEdges.map(edge => ({
                ...edge,
                type: edge.type || 'smart',
                animated: edge.animated !== undefined ? edge.animated : true
            }));
            setEdges(initEdges);
        }
    }, [importedEdges, setEdges]);

    const onSelectionChange = useCallback(({nodes: selNodes, edges: selEdges}) => {
        const selected = selNodes[0] || selEdges[0] || null;
        setSelectedElement(selected);
    }, []);

    const onDeleteSelected = useCallback(() => {
        if (!selectedElement) return;
        if (selectedElement.id === 'startNode') {
            return;
        }
        if (nodes.some(n => n.id === selectedElement.id)) {
            setNodes((nds) => nds.filter(node => node.id !== selectedElement.id));
            setEdges(eds => eds.filter(edge => edge.source !== selectedElement.id && edge.target !== selectedElement.id));
        } else {
            setEdges(eds => eds.filter(edge => edge.id !== selectedElement.id));
        }
        setSelectedElement(null);
    }, [selectedElement, nodes, setNodes, setEdges, t]);

    const onFitView = useCallback(() => {
        fitView({padding: 0.4, duration: 800});
    }, [fitView]);

    const onClear = useCallback(() => {
        setNodes(initialNodes);
        setEdges([]);
        setSelectedElement(null);
        fitView({padding: 0.4, duration: 800})
    }, [setNodes, fitView]);

    const onConnect = useCallback((params) => {
        const newEdge = {
            ...params,
            type: 'smart',
            animated: true,
            markerEnd: {
                type: MarkerType.ArrowClosed,
                color: isDark ? '#3b82f6' : '#2563eb'
            },
            style: {
                strokeWidth: 2,
                stroke: isDark ? '#3b82f6' : '#2563eb'
            }
        };
        setEdges(eds => addEdge(newEdge, eds));
    }, [setEdges, isDark]);

    const onDrop = useCallback((event) => {
        event.preventDefault();
        const rawData = event.dataTransfer.getData('application/agent-template');
        if (!rawData) return;
        try {
            const templateData = JSON.parse(rawData);
            const agentNodes = nodes.filter(n => n.id.startsWith('checkStep'));
            const nextIndex = agentNodes.length + 1;
            const newId = `checkStep${nextIndex}`;

            const newNode = {
                id: newId,
                type: 'agentNode',
                position: screenToFlowPosition({x: event.clientX, y: event.clientY}),
                data: {
                    ...templateData,
                    task: templateData.defaultTask,
                    input_params: {},
                    name: newId,
                    isDark: isDark
                }
            }
            setNodes(nds => nds.concat(newNode));
        } catch (e) {
            console.error(t('error.parse_failed'), error)
        }
    }, [nodes, screenToFlowPosition, setNodes, t]);

    const themeClasses = {
        container: isDark ? 'bg-[#0f172a] text-slate-200' : 'bg-[#f8fafc] text-slate-900',
        panel: isDark ? 'bg-slate-900/80 border-slate-700 shadow-[0_0_20px_rgba(0,0,0,0.4)]' : 'bg-white/80 border-white/20 shadow-2xl',
        gridColor: isDark ? '#334155' : '#cbd5e1'
    }

    return (
        <div
            className={`workflow-editor-container relative h-full w-full overflow-hidden font-sans transition-colors duration-300 ${themeClasses.container}`}>
            <div className={"absolute inset-0 z-0"}>
                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    nodeTypes={nodeTypes}
                    edgeTypes={edgeTypes}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    onConnect={onConnect}
                    onDrop={onDrop}
                    proOptions={{hideAttribution: true}}
                    deleteKeyCode={[]}
                    onDragOver={(e => {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                    })}
                    onSelectionChange={onSelectionChange}
                    defaultEdgeOptions={{
                        type: 'smoothstep',
                        labelStyle: {
                            fontSize: '16px',
                            fontWeight: 600,
                            fill: isDark ? '#cbd5e1' : '#334155'
                        }
                    }}
                    elevateEdgesOnSelect={true}
                    onInit={setRfInstance}
                    onBeforeDelete={async ({nodes: nodesToDelete, edges: edgesToDelete}) => {
                        const hasProtectedNode = nodesToDelete.some((n) => n.id === 'startNode' || n.id === 'endNode');
                        return !hasProtectedNode;
                    }}
                    colorMode={isDark ? 'dark' : 'light'}
                    fitView
                    fitViewOptions={{padding: 0.2}}
                >
                    <Background color={themeClasses.gridColor} gap={20} variant="dots"/>
                    <Controls position={"bottom-right"}
                              className={`m-4 border-none rounded-lg shadow-xl ${isDark ? 'fill-white bg-slate-800' : 'bg-white'}`}/>
                </ReactFlow>
            </div>

            <div className={"absolute top-6 left-1/2 -translate-x-1/2 z-50 pointer-events-none"}>
                <div className={"pointer-events-auto"}>
                    <Toolbar
                        isDark={isDark}
                        nodes={nodes}
                        edges={edges}
                        onCancel={onCancel}
                        onClear={onClear}
                        onFitView={onFitView}
                        phenomenon={phenomenon}
                    />
                </div>
            </div>

            <div
                className={"absolute justify-center left-8 top-12 bottom-12 w-32 z-40 pointer-events-none flex flex-col min-h-0"}>
                <div
                    className={`pointer-events-auto flex flex-col backdrop-blur-md border rounded-2xl overflow-hidden transition-all ${themeClasses.panel}`}>
                    <Sidebar isDark={isDark}/>
                </div>
            </div>

            <div
                className={`absolute justify-center right-4 top-4 bottom-4 w-80 z-40 pointer-events-none flex flex-col min-h-0 transition-all duration-300 transform ${selectedElement ? 'translate-x-0 opacity-100' : 'translate-x-10 opacity-0'}`}>
                <div
                    className={`pointer-events-auto flex flex-col backdrop-blur-md border rounded-2xl overflow-hidden ${themeClasses.panel}`}>
                    {selectedElement && (
                        <PropertyPanel
                            isDark={isDark}
                            selectedElement={selectedElement}
                            nodes={nodes}
                            edges={edges}
                            setNodes={setNodes}
                            setEdges={setEdges}
                            onDelete={onDeleteSelected}
                            setPhenomenon={setPhenomenon()}
                        />
                    )}
                </div>
            </div>
        </div>
    )
}

const WorkFlowEditor = ({visible, onCancel, isDark, importedNodes, importedEdges}) => {
    const baseBg = isDark ? 'bg-[#0f172a]' : 'bg-[#f8fafc]';
    const displayStyle = visible
        ? `absolute inset-0 z-[50] translate-y-0 opacity-100 transition-all duration-300 ${baseBg}`
        : `absolute inset-0 z-[-1] translate-y-4 opacity-0 pointer-events-none transition-all duration-300 ${baseBg}`;
    return (
        <div className={displayStyle}>
            <ReactFlowProvider>
                <FlowInner onCancel={onCancel} isDark={isDark} importedNodes={importedNodes}
                           importedEdges={importedEdges}/>
            </ReactFlowProvider>
        </div>
    )
}
export default WorkFlowEditor;