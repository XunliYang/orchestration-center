import React ,{useMemo, memo} from "react";
import {Handle, Position} from "@xyflow/react";

const AGENT_COLORS = [
    {light: 'bg-blue-100 text-blue-700', dark: 'bg-blue-500/20 bg-blue-300', bar: 'bg-blue-500'},
    {light: 'bg-purple-100 text-purple-700', dark: 'bg-purple-500/20 bg-purple-300', bar: 'bg-purple-500'},
    {light: 'bg-teal-100 text-teal-700', dark: 'bg-teal-500/20 bg-teal-300', bar: 'bg-teal-500'},
    {light: 'bg-orange-100 text-orange-700', dark: 'bg-orange-500/20 bg-orange-300', bar: 'bg-orange-500'},
    {light: 'bg-pink-100 text-pink-700', dark: 'bg-pink-500/20 bg-pink-300', bar: 'bg-pink-500'},
    {light: 'bg-emerald-100 text-emerald-700', dark: 'bg-emerald-500/20 bg-emerald-300', bar: 'bg-emerald-500'},
    {light: 'bg-indigo-100 text-indigo-700', dark: 'bg-indigo-500/20 bg-indigo-300', bar: 'bg-indigo-500'},
    {light: 'bg-rose-100 text-rose-700', dark: 'bg-rose-500/20 bg-rose-300', bar: 'bg-rose-500'},
]

const getAgentTheme = (agentName) => {
    if (!agentName || agentName === 'Agent') {
        return {light: `bg-slate-100 text-slate-500`, dark: 'bg-slate-800 bg-slate-400', bar: 'bg-slate-400'};
    }
    let hash = 0;
    for (let i = 0; i < agentName.length; i++) {
        hash = agentName.charCodeAt(i) + ((hash << 5) - hash);
    }

    const index = Math.abs(hash) % AGENT_COLORS.length;
    return AGENT_COLORS[index];
}

const AgentNode = ({data, selected}) => {
    const isDark = data.isDark || false;
    const status = data.status || 'pending';
    const agentName = data.agent || 'Agent';

    const agentTheme = useMemo(() => getAgentTheme(agentName), [agentName]);
    const badgeColorClass = isDark ? agentTheme.dark : agentTheme.light;

    const theme = {
        bg: isDark ? 'bg-zinc-900/90' : 'bg-white',
        border: isDark ? 'border-zinc-700/50' : 'border-slate-200',
        textMain: isDark ? 'text-zinc-100' : 'text-slate-800',
        textSub: isDark ? 'text-zinc-400' : 'text-slate-500',
        shadow: selected ? (isDark ? 'shadow-[0_0_20px_rgba(59,130,246,0.15)]' : 'shadow-xl shadow-blue-500/10') : 'shadow-sm hover:shadow-md'
    }

    const handleBaseStyle = `
    !w-[4px] !h-[4px] border-[1.5px] border-white dark:border-zinc-800
    transition-all duration-300 ease-out cursor-crosshair
    
    hover:!w-[28.5px] hover:!h-[28.5px] hover:shadow-sm
    
    [&.react-flow__handle-connecting]:!w-[8.5px] [&.react-flow__handle-connecting]!h-[8.5px]
    [&.react-flow__handle-connecting]:ring-2 [&.react-flow__handle-connecting]:ring-black/10 dark:[&.react-flow__handle-connecting]:ring-white/10
    
    after:content-[''] after:absolute after:top-1/2 after:left=1/2 after:-translate-x-1/2 after:-translate-y-1/2
    after:w-[60px] after:h-[60px] after:bg-transparent after:z-10
    
    before:content-[''] before:absolute before:top-1/2 before:left-1/2 before:-translate-x-1/2 before:-translate-y-1/2
    before:w-0 before:h-0 before:rounded-full before:transition-all before:duration-300 before:z-[-1]
    
    [&.react-flow__handle-valid]:!w-[8.5px] [&.react-flow__handle-valid]:!h-[8.5px]
    [&.react-flow__handle-valid]:before:w-10 [&.react-flow__handle-valid]:before:h-10
    `;

    const isCurrent = status === 'current';
    const isExecute = status === 'executed';

    return (
        <div
            className={`touch-none relative min-w-[140px] max-w-[350px] rounded-xl border transition-all duration-500 ${theme.bg} ${theme.border} ${theme.textMain} backdrop-blur-sm overflow-hidden ${selected ? 'ring-2 ring-blue-500/50 ring-offset-2' + (isDark ? 'ring-offset-zinc-950' : 'ring-offset-white') : ''}`}>
            <div className={`h-[3px] w-full transition-colors duration-500 ${agentTheme.bar}`}/>
            <div className={"px-4 py-4 flex flex-col"}>
                <div className={"flex justify-between items-center leading-none mb-1.5"}>
                    <span
                        className={`text-[12px] font-bold tracking-tighter uppercase px-1.5 py-0.5 rounded-sm transition-colors duration-300 ${badgeColorClass}`}>
                        {agentName}
                    </span>
                    <div className={"flex items-center gap-1.5"} title={`Status: ${status}`}>
                        <div className={"relative flex h-2.5 w-2.5"}>
                            {isCurrent && (
                                <span
                                    className={"animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"}></span>
                            )}
                            <span
                                className={`relative inline-flex rounded-full h-2.5 w-2.5 transition-colors duration-300 ${isCurrent ? 'bg-blue-500' : isExecute ? 'bg-emerald-500' : (isDark ? 'bg-zinc-700' : 'bg-slate-200')}`}></span>
                        </div>
                    </div>
                </div>
                <h4 className={`text-[12px] font-bold leading-snug break-words whitespace-normal ${isCurrent ? 'text-blue-500' : (isDark ? 'text-slate-200' : 'text-slate-700')}`}>
                    {data.skill}
                </h4>
            </div>
            <Handle type={"target"} position={Position.Top} id={"t-top"} style={{left:'40%'}} className={`!bg-blue-400 [&.react-flow__handle-valid]:before:bg-blue-400/40 ${handleBaseStyle}`}/>
            <Handle type={"source"} position={Position.Top} id={"s-top"} style={{left:'60%'}} className={`!bg-green-400 [&.react-flow__handle-valid]:before:bg-green-500/40 ${handleBaseStyle}`}/>
            <Handle type={"target"} position={Position.Bottom} id={"t-bottom"} style={{left:'40%'}} className={`!bg-blue-400 [&.react-flow__handle-valid]:before:bg-blue-400/40 ${handleBaseStyle}`}/>
            <Handle type={"source"} position={Position.Bottom} id={"s-bottom"} style={{left:'60%'}} className={`!bg-green-400 [&.react-flow__handle-valid]:before:bg-green-500/40 ${handleBaseStyle}`}/>
            <Handle type={"target"} position={Position.Left} id={"t-left"} style={{left:'40%'}} className={`!bg-slate-400 [&.react-flow__handle-valid]:before:bg-slate-400/40 ${handleBaseStyle}`}/>
            <Handle type={"source"} position={Position.Left} id={`s-left`} style={{left:'60%'}} className={`!bg-blue-500 [&.react-flow__handle-valid]:before:bg-blue-500/40 ${handleBaseStyle}`}/>
            <Handle type={"target"} position={Position.Right} id={"t-right"} style={{left:'40%'}} className={`!bg-slate-400 [&.react-flow__handle-valid]:before:bg-slate-400/40 ${handleBaseStyle}`}/>
            <Handle type={"source"} position={Position.Right} id={"s-right"} style={{left:'60%'}} className={`!bg-blue-500 [&.react-flow__handle-valid]:before:bg-blue-500/40 ${handleBaseStyle}`}/>
        </div>
    )
}

export default memo(AgentNode);