import dagre from 'dagre';

// 1. Dagre 自动排版逻辑 (保持不变)
const getLayoutedElements = (nodes, edges, direction = 'TB') => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    dagreGraph.setGraph({ rankdir: direction, ranksep: 100, nodesep: 80 });

    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: node.width, height: node.height });
    });

    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        return {
            ...node,
            position: {
                x: nodeWithPosition.x - node.width / 2,
                y: nodeWithPosition.y - node.height / 2,
            },
        };
    });

    return { nodes: layoutedNodes, edges };
};

// 2. 动态计算最佳 Handle 逻辑 (保持不变)
const getBestHandles = (sourceNode, targetNode) => {
    const sPos = sourceNode.position;
    const tPos = targetNode.position;

    const sCenter = { x: sPos.x + sourceNode.width / 2, y: sPos.y + sourceNode.height / 2 };
    const tCenter = { x: tPos.x + targetNode.width / 2, y: tPos.y + targetNode.height / 2 };

    const dx = tCenter.x - sCenter.x;
    const dy = tCenter.y - sCenter.y;

    if (Math.abs(dy) > Math.abs(dx)) {
        return dy > 0
            ? { sourceHandle: 's-bottom', targetHandle: 't-top' }
            : { sourceHandle: 's-top', targetHandle: 't-bottom' };
    } else {
        return dx > 0
            ? { sourceHandle: 's-right', targetHandle: 't-left' }
            : { sourceHandle: 's-left', targetHandle: 't-right' };
    }
};

// 3. 核心转换逻辑 (已适配 PSOP 结构)
const transformWorkflowToReactFlow = (rawInput) => {
    if (!rawInput || (!rawInput.steps && !Array.isArray(rawInput))) {
        console.warn("无效的工作流数据格式");
        return { nodes: [], edges: [] };
    }

    const steps = Array.isArray(rawInput) ? rawInput : (rawInput.steps || []);

    const nodes = [];
    const edges = [];
    const targetStepNames = new Set();

    // 预处理第一遍：规范化 next 连线关系，处理隐式顺序流转
    steps.forEach((step, index) => {
        let nextSteps = [];

        if (step.next && Array.isArray(step.next) && step.next.length > 0) {
            // 如果明确指定了 next 跳转条件
            nextSteps = step.next;
        } else if (index < steps.length - 1) {
            // 如果 next 为空且不是最后一步，隐式指向数组中的下一步
            nextSteps = [{ step: steps[index + 1].name, condition: '' }];
        }

        nextSteps.forEach(link => {
            // 兼容可能叫 target 或者 step 的字段
            const targetId = link.step || link.target || 'END';
            if (targetId !== 'END' && targetId !== 'end' && targetId !== 'END_OF_WORKFLOW') {
                targetStepNames.add(targetId);
            }
        });

        // 挂载到临时属性，供后续生成连线使用
        step._normalizedNext = nextSteps;
    });

    // 处理第二遍：生成节点与边
    steps.forEach((step) => {
        const nodeId = step.name;

        // 聚合 subtasks 的信息用于节点展示
        const agents = step.subtasks?.map(t => t.agent).join(', ') || 'System';
        const skills = step.subtasks?.map(t => t.skill).join(', ') || 'None';
        // 简单计算节点整体状态: 只要有一个是 running 就是 running
        const nodeStatus = step.subtasks?.some(t => t.status === 'running')
            ? 'running'
            : (step.subtasks?.every(t => t.status === 'success') ? 'success' : 'pending');

        nodes.push({
            id: nodeId,
            type: 'agentNode',
            position: { x: 0, y: 0 },
            width: 250,  // 稍微加宽，避免多个 Agent 名字挤压
            height: 110,
            data: {
                ...step,
                label: step.name, // 使用步骤名作为主标题
                description: step.subtasks?.[0]?.description || '', // 取第一个子任务描述作为副标题
                agent: agents,
                skill: skills,
                status: nodeStatus
            }
        });

        // 基于预处理的流转关系生成连线
        step._normalizedNext?.forEach((link, idx) => {
            const rawTarget = link.step || link.target;
            const isEnd = rawTarget === 'end' || rawTarget === 'END';
            const targetId = isEnd ? 'END_OF_WORKFLOW' : rawTarget;

            edges.push({
                id: `e-${nodeId}-${targetId}-${idx}`,
                source: nodeId,
                target: targetId,
                label: link.condition || '',
                animated: nodeStatus === 'running', // 如果当前节点在运行，出边呈现动画
                style: { stroke: '#94a3b8', strokeWidth: 2 }
            });
        });
    });

    // 添加全局 START 节点
    const startNodes = steps.filter(s => !targetStepNames.has(s.name));
    if (startNodes.length > 0) {
        nodes.unshift({
            id: 'START_NODE',
            type: 'startNode',
            position: { x: 0, y: 0 },
            width: 120,
            height: 50,
            data: { label: 'START', status: 'completed' }
        });

        startNodes.forEach(sn => {
            edges.unshift({
                id: `e-start-${sn.name}`,
                source: 'START_NODE',
                target: sn.name,
                style: { stroke: '#94a3b8', strokeDasharray: '5,5' }
            });
        });
    }

    // 处理末端节点，如果它没有 next 流转，将其指向 END_OF_WORKFLOW
    const terminalNodes = steps.filter(s => !s._normalizedNext || s._normalizedNext.length === 0);
    const hasExplicitEndEdge = edges.some(e => e.target === 'END_OF_WORKFLOW');

    if (hasExplicitEndEdge || terminalNodes.length > 0) {
        const endNodeId = 'END_OF_WORKFLOW';
        if (!nodes.find(n => n.id === endNodeId)) {
            nodes.push({
                id: endNodeId,
                type: 'endNode',
                position: { x: 0, y: 0 },
                width: 120,
                height: 50,
                data: { label: 'END', status: 'pending' }
            });
        }

        // 把没有下游的节点连到 END
        terminalNodes.forEach(tn => {
            edges.push({
                id: `e-${tn.name}-implicit-end`,
                source: tn.name,
                target: endNodeId,
                style: { stroke: '#94a3b8', strokeWidth: 2 }
            });
        });
    }

    // 清理临时字段
    steps.forEach(s => delete s._normalizedNext);

    // 自动排版
    const layoutedData = getLayoutedElements(nodes, edges, 'TB');

    // 计算最佳连接点 (Handles)
    const finalEdges = layoutedData.edges.map(edge => {
        const sourceNode = layoutedData.nodes.find(n => n.id === edge.source);
        const targetNode = layoutedData.nodes.find(n => n.id === edge.target);

        if (sourceNode && targetNode) {
            const { sourceHandle, targetHandle } = getBestHandles(sourceNode, targetNode);
            return { ...edge, sourceHandle, targetHandle };
        }
        return edge;
    });

    return { nodes: layoutedData.nodes, edges: finalEdges };
};

export { transformWorkflowToReactFlow, getBestHandles, getLayoutedElements };