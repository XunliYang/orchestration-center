import {Handle} from "@xyflow/react";

export const StartNode = ({data})=>{
    return (
        <div className={"w-16 h-16 rounded-full bg-emerald-500 shadow-lg border-4 border-white flex items-center justify-center text-white font-bold text-sm relative group"}>
            <div className={"absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"}>
                开始节点
            </div>
            START
            <Handle type={"source"} position={Position.Bottom} id={"s-bottom"} className={"w-3 h-3 bg-emerald-400 border-2 border-white"}/>
            <Handle type={"source"} position={Position.Right} id={"s-right"} className={"w-3 h-3 bg-emerald-400 border-2 border-white opacity-0 group-hover:opacity-100"}/>
        </div>
    )
}

export const EndNode = ({data}) => {
    return (
        <div className={"w-16 h-16 rounded-full bg-rose-500 shadow-lg border-4 border-white flex items-center justify-center text-white font-bold text-sm relative group"}>
            <div className={"absolute -top-8 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-[10px] px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap"}>
                结束节点
            </div>
            END
            <Handle type={"target"} position={Position.Top} id={"t-top"} className={"w-3 h-3 bg-rose-400 border-2 border-white"}/>
            <Handle type={"target"} position={Position.Left} id={"t-left"} className={"w-3 h-3 bg-rose-400 border-2 border-white opacity-0 group-hover:opacity-100"}/>
        </div>
    )
}