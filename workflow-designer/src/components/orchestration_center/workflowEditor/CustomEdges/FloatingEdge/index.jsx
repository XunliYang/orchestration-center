import {useInternalNode} from "@xyflow/react";
import {getEdgeParams} from "@/components/orchestration_center/workflowEditor/CustomEdges/FloatingEdge/utils.js";
import {BaseEdge, getStraightPath} from "reactflow";

function FloatingEdge({id, source, target, markerEnd, style}) {
    const sourceNode = useInternalNode(source);
    const targetNode = useInternalNode(target);

    if (!sourceNode || !targetNode) {
        return null;
    }
    const {sx, sy, tx, ty} = getEdgeParams(sourceNode, targetNode);

    const [path] = getStraightPath({
        sourceX: sx,
        sourceY: sy,
        targetX: tx,
        targetY: ty,
    });

    return (
        <BaseEdge path={path} id={id} markerEnd={markerEnd} style={style} className={"react-flow__edge-path"}/>
    )
}

export default FloatingEdge;