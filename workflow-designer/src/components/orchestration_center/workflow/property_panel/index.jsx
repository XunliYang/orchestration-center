import React, {useCallback, useEffect, useMemo} from 'react';
import KvIndex from "@/components/orchestration_center/workflow/kv_editor/index.jsx";
import {useTranslation} from "react-i18next";
import DeleteConfirm from "@/components/common/pop_confirm/index.jsx";

const PropertyPanel = ({ selectedElement, nodes, edges, setPhenomenon,setNodes, setEdges,isDark,onDelete}) => {
    const { t } = useTranslation();
    const theme = {
        container: isDark ? 'bg-zinc-950 text-zinc-300' : 'bg-white text-zinc-800',
        emptyBg: isDark ? 'bg-zinc-950' : 'bg-zinc-50/50',
        header: isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50/30 border-zinc-200/50',
        label: isDark ? 'text-zinc-500' : 'text-zinc-500',
        inputArea: isDark ? 'bg-zinc-900 border-zinc-800 focus:border-zinc-500 text-zinc-200' : 'bg-zinc-50 border-zinc-200 focus:border-zinc-400',
        footer: isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50/50 border-zinc-100',
        confirmBtn: isDark ? 'bg-zinc-100 text-zinc-950 hover:bg-white' : 'bg-zinc-800 text-white hover:bg-zinc-900'
    };
    const activeElement = useMemo(() => {
        if (!selectedElement) return null;
        if (selectedElement.source) {
            return edges.find(e => e.id === selectedElement.id);
        } else {
            return nodes.find(n => n.id === selectedElement.id);
        }
    }, [selectedElement, nodes, edges]);
    if (!activeElement) {
        return (
            <div className={`w-80 h-full flex flex-col items-center justify-center p-8 text-center transition-colors ${theme.emptyBg}`}>
                <div className={`w-12 h-12 rounded-full mb-4 flex items-center justify-center ${isDark ? 'bg-zinc-900 text-zinc-700' : 'bg-zinc-200 text-zinc-400'}`}>
                    <svg fill="none" viewBox="0 0 24 24" stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5" /></svg>
                </div>
                <p className={`text-sm font-medium ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>{t('workflow.panel.empty')}</p>
            </div>
        );
    }
    const renderValue = (val) => {
        if (typeof val === 'object' && val !== null) {
            return (
                <pre className="p-2 bg-zinc-100 dark:bg-zinc-800 rounded text-xs overflow-auto max-h-40">
                {JSON.stringify(val, null, 2)}
            </pre>
            );
        }
        return <span className="font-medium">{String(val)}</span>;
    };
    const isNode = !('source' in activeElement);
    const data = activeElement.data || {};
    const updateData = useCallback((key, value) => {
        if (!activeElement) return;

        const isNode = !('source' in activeElement); // 判断是否为节点

        if (isNode) {
            setNodes((nds) =>
                nds.map((node) => {
                    if (node.id === activeElement.id) {
                        return { ...node, data: { ...node.data, [key]: value } };
                    }
                    return node;
                })
            );
        } else {
            setEdges((eds) =>
                eds.map((edge) =>
                    edge.id === activeElement.id
                        ? { ...edge, data: { ...edge.data, [key]: value } }
                        : edge
                )
            );
        }
    }, [activeElement, setNodes, setEdges]);
    const handleDelete = () => {
        onDelete();
    }
    const handleSkillChange = (selectedName) => {
        const selectedSkill = data.skillsList.find(s => s.name === selectedName);

        if (selectedSkill) {
            const parsedInputs = {};
            if (selectedSkill.inputs) {
                selectedSkill.inputs.split('\n').forEach(line => {
                    const [key, ...descParts] = line.split(':');
                    if (key) {
                        parsedInputs[key.trim()] = descParts.join(':').trim();
                    }
                });
            }

            updateData('skill', selectedName);
            updateData('inputs', parsedInputs);
        }
    };
    useEffect(() => {
        if (data.skill && (!data.inputs || Object.keys(data.inputs).length === 0)) {

            const currentSkill = data.skillsList?.find(s => s.name === data.skill);

            if (currentSkill && currentSkill.inputs) {
                const parsedInputs = {};
                currentSkill.inputs.split('\n').forEach(line => {
                    const [key, ...descParts] = line.split(':');
                    if (key) {
                        parsedInputs[key.trim()] = descParts.join(':').trim();
                    }
                });

                updateData('inputs', parsedInputs);
                console.log("初始化：已自动解析并同步 inputDefine");
            }
        }
    }, [data.skill, data.skillsList]);

    useEffect(() => {
        if (data.skill && (!data.outputs || Object.keys(data.outputs).length === 0)) {
            const currentSkill = data.skillsList?.find(s => s.name === data.skill);
            if (currentSkill && currentSkill.outputs) {
                const parsedInputs = {};
                currentSkill.outputs.split('\n').forEach(line => {
                    const [key, ...descParts] = line.split(':');
                    if (key) {
                        parsedInputs[key.trim()] = descParts.join(':').trim();
                    }
                });

                updateData('outputs', parsedInputs);
                console.log("初始化：已自动解析并同步 inputDefine");
            }
        }
    }, [data.skill, data.skillsList]);
    const renderSafeValue = (val) => {
        if (val === null || val === undefined) return '-';
        if (typeof val === 'object') {
            return <span className="text-[11px] opacity-70 break-all">{JSON.stringify(val)}</span>;
        }
        return val;
    };
    return (
        <div className={`flex flex-col h-full w-full transition-colors ${theme.container}`}>
            <div className={`flex flex-row items-center justify-between p-4 border-b transition-colors ${theme.header}`}>
                <h3 className="text-sm font-bold flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full shadow-[0_0_8px_rgba(255,255,255,0.2)] ${isNode ? 'bg-zinc-400' : 'bg-zinc-500'}`} />
                    {isNode ? t('workflow.panel.nodeConfig') : t('workflow.panel.edgeConfig')}
                </h3>
                <p className="text-[12px] text-zinc-500 font-mono tracking-wider uppercase truncate">
                    ID: {activeElement.id}
                </p>
                <DeleteConfirm
                    title={t('common.confirm_delete')}
                    onConfirm={onDelete}
                    isDark={isDark}
                >
                    <button className="px-3 py-1 text-sm bg-red-500/10 hover:bg-red-500 text-red-500 border border-red-500/20 rounded-lg transition-all">
                        {t('common.delete')}
                    </button>
                </DeleteConfirm>
            </div>

            <div className="p-4 space-y-6 flex-1 overflow-y-auto custom-scrollbar">
                {isNode ? (
                    <>

                        <ReadOnlyField label={t('workflow.panel.agentName')} value={data.agent} isDark={isDark} />

                        <Field
                            label={t('workflow.panel.taskDesc')}
                            value={data.task}
                            onChange={(v) => updateData('task', v)}
                            placeholder={t('workflow.panel.taskPlaceholder')}
                            isDark={isDark}
                            isTextArea
                        />

                        {data.skillsList?.length > 0 ? (
                            <div className="space-y-1.5">
                                <label className={`text-[14px] ml-1 font-bold  tracking-wide ${theme.label}`}>
                                    {t('workflow.panel.selectSkill')}
                                </label>
                                <div className="relative">
                                    <select
                                        className={`w-full px-3 py-2 rounded-lg text-sm appearance-none cursor-pointer transition-all outline-none border ${theme.inputArea}`}
                                        value={data.skill || ''}
                                        onChange={(e) => handleSkillChange(e.target.value)}
                                    >
                                        <option value="" disabled>{t('workflow.panel.placeholderSelect')}</option>
                                        {data.skillsList.map((skill, idx) => (
                                            <option key={`${skill.id}-${idx}`} value={skill.name}>{skill.name}</option>
                                        ))}
                                    </select>
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <ReadOnlyField label={t('workflow.panel.executeSkill')} value={data.skill} isDark={isDark} />
                        )}
                        <div className="space-y-2">
                            <label className={`text-[14px] ml-1 font-bold uppercase tracking-wide ${theme.label}`}>
                                {t('workflow.panel.inputDefine')}
                            </label>
                            <div className={`text-[14px] p-3 rounded-xl border transition-colors ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                                {Object.entries(data.inputs || {}).map(([k, v]) => (
                                    <div key={k} className="mb-1.5 last:mb-0 flex items-start gap-2">
                                        <span className={`font-mono font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{k}:</span>
                                        <span className="opacity-80">{renderSafeValue(v)}</span>
                                    </div>
                                ))}
                                {(!data.inputs || Object.keys(data.inputs).length === 0) &&
                                    <span className="text-zinc-600 italic">{t('workflow.panel.noInput')}</span>}
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className={`text-[14px] ml-1 font-bold uppercase tracking-wide ${theme.label}`}>
                                {t('workflow.panel.outputDefine')}
                            </label>
                            <div className={`text-[14px] p-3 rounded-xl border transition-colors ${isDark ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-white border-zinc-200 text-zinc-600'}`}>
                                {Object.entries(data.outputs || {}).map(([k, v]) => (
                                    <div key={k} className="mb-1.5 last:mb-0 flex items-start gap-2">
                                        <span className={`font-mono font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-800'}`}>{k}:</span>
                                        <span className="opacity-80">{renderSafeValue(v)}</span>
                                    </div>
                                ))}
                                {(!data.outputs || Object.keys(data.outputs).length === 0) &&
                                    <span className="text-zinc-600 italic">{t('workflow.panel.noOutput')}</span>}
                            </div>
                        </div>

                        <KvIndex
                            title={t('workflow.panel.inputParams')}
                            data={data.input_params || {}}
                            onChange={(v) => updateData('input_params', v)}
                            isDark={isDark}
                        />
                    </>
                ) : (
                    <section className="space-y-4">
                        <div className={`flex flex-col gap-2 p-3 rounded-xl border ${isDark ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50 border-zinc-100'}`}>
                            <div className="flex justify-between text-[12px] tracking-tight">
                                <span className="text-zinc-500 font-bold uppercase">Source</span>
                                <span className={isDark ? 'text-zinc-300' : 'text-zinc-700'}>{activeElement.source}</span>
                            </div>
                            <div className="flex justify-between text-[12px] tracking-tight">
                                <span className="text-zinc-500 font-bold uppercase">Target</span>
                                <span className={isDark ? 'text-zinc-300' : 'text-zinc-700'}>{activeElement.target}</span>
                            </div>
                        </div>
                        <Field
                            label={t('workflow.panel.condition')}
                            value={data.condition}
                            onChange={(v) => updateData('condition', v)}
                            placeholder="${variable} == 'value'"
                            isDark={isDark}
                            fontMono
                        />
                    </section>
                )}
            </div>

            <div className={`p-4 border-t sticky bottom-0 transition-colors ${theme.footer}`}>
                <button
                    className={`w-full py-2.5 text-xs font-bold rounded-xl transition-all active:scale-95 shadow-lg ${theme.confirmBtn}`}
                    onClick={() => console.log('Current Config:', data)}
                >
                    {t('workflow.panel.confirm')}
                </button>
            </div>
        </div>
    );
};


const ReadOnlyField = ({ label, value, isDark }) => (
    <div className={`flex justify-between items-center py-3 border-b transition-colors ${isDark ? 'border-zinc-800/50' : 'border-zinc-100'}`}>
        <span className={`text-[14px] ${isDark ? 'text-zinc-200' : 'text-zinc-500'}`}>{label}</span>
        <span className={`text-[14px] font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>{value || '-'}</span>
    </div>
);

const Field = ({ label, value, onChange, placeholder, isTextArea, fontMono, isDark }) => {
    const baseClass = `w-full px-3 py-2 rounded-lg text-sm transition-all outline-none border shadow-sm placeholder:text-zinc-600 ${
        isDark
            ? 'bg-zinc-900 border-zinc-800 focus:border-zinc-500 text-zinc-100'
            : 'bg-zinc-50 border-zinc-200 focus:border-zinc-400 text-zinc-800'
    } ${fontMono ? 'font-mono text-[14px]' : ''}`;

    return (
        <div className="space-y-1.5">
            <label className={`text-[14px] ml-1 font-bold uppercase tracking-wide ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
                {label}
            </label>
            {isTextArea ? (
                <textarea rows={3} className={`${baseClass} resize-none`} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
            ) : (
                <input className={baseClass} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
            )}
        </div>
    );
};

export default PropertyPanel;