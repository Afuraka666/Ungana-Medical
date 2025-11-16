

import React, { useEffect, useRef, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Discipline } from '../types';
import type { KnowledgeMapData, KnowledgeNode } from '../types';
import { ConceptCard } from './ConceptCard';
import { getConceptConnectionExplanation } from '../services/geminiService';

declare const d3: any;

const svgToDataURL = async (svgEl: SVGSVGElement): Promise<string> => {
    // Add a white background rectangle as the first child of the SVG
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', '100%');
    bgRect.setAttribute('height', '100%');
    bgRect.setAttribute('fill', 'white');
    svgEl.prepend(bgRect);
    
    const xml = new XMLSerializer().serializeToString(svgEl);

    // Remove the temporary background rect
    svgEl.removeChild(bgRect);

    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const b64start = 'data:image/svg+xml;base64,';
    const image64 = b64start + svg64;

    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const padding = 20;
            const viewBox = svgEl.viewBox.baseVal;
            const svgWidth = viewBox && viewBox.width > 0 ? viewBox.width : img.width;
            const svgHeight = viewBox && viewBox.height > 0 ? viewBox.height : img.height;
            canvas.width = svgWidth + padding * 2;
            canvas.height = svgHeight + padding * 2;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.fillStyle = '#FFFFFF';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(img, padding, padding, svgWidth, svgHeight);
                resolve(canvas.toDataURL('image/png'));
            } else {
                resolve('');
            }
        };
        img.onerror = () => resolve('');
        img.src = image64;
    });
};


// --- Helper Components ---
const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center h-full p-4">
        <svg className="animate-spin h-8 w-8 text-brand-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
    onToggleFullscreen: () => void;
    isFullscreen: boolean;
}

const MapControls: React.FC<MapControlsProps> = ({ onZoomIn, onZoomOut, onReset, onToggleFullscreen, isFullscreen }) => {
    const buttonClasses = "bg-white/80 backdrop-blur-sm hover:bg-white text-gray-700 shadow-md border border-gray-200 rounded-lg w-10 h-10 flex items-center justify-center transition";
    return (
        <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
            <button onClick={() => onZoomIn()} title="Zoom In" className={buttonClasses}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            </button>
            <button onClick={() => onZoomOut()} title="Zoom Out" className={buttonClasses}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
            </button>
            <button onClick={() => onReset()} title="Reset View" className={buttonClasses}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 10a5 5 0 1110 0 5 5 0 01-10 0zM2.455 6.09A8.023 8.023 0 014.28 4.282a8.023 8.023 0 013.801-1.825 1 1 0 01.91 1.838A6.023 6.023 0 005.16 8.55a1 1 0 11-1.84 1.01A8.003 8.003 0 012.455 6.09zM15.72 15.718a8.023 8.023 0 01-3.801 1.825 1 1 0 01-.91-1.838 6.023 6.023 0 003.11-2.47 1 1 0 111.84-1.01 8.003 8.003 0 01-2.695 3.504z" clipRule="evenodd" /></svg>
            </button>
             <button onClick={() => onToggleFullscreen()} title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} className={buttonClasses}>
                {isFullscreen ? (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-2.25L9.25 11.5h-2.25a.75.75 0 000 1.5h3.5a.75.75 0 00.75-.75v-3.5a.75.75 0 00-1.5 0v2.25L5.5 6.25h2.25a.75.75 0 000-1.5h-3.5a.75.75 0 00-.75.75zm10 5a.75.75 0 00.75-.75v-3.5a.75.75 0 00-1.5 0v2.25L10.75 8.5h2.25a.75.75 0 000-1.5h-3.5a.75.75 0 00-.75.75v3.5a.75.75 0 001.5 0v-2.25L14.5 13.75h-2.25a.75.75 0 000 1.5h3.5a.75.75 0 00.75-.75z" clipRule="evenodd" /></svg>
                )}
            </button>
        </div>
    );
};

interface ContextMenuProps {
    position: { x: number, y: number } | null;
    onClose: () => void;
    onExplainConnection: (targetNode: KnowledgeNode) => void;
    sourceNode: KnowledgeNode | null;
    allNodes: KnowledgeNode[];
}

const ContextMenu: React.FC<ContextMenuProps> = ({ position, onClose, onExplainConnection, sourceNode, allNodes }) => {
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [onClose]);

    if (!position || !sourceNode) return null;

    return (
        <div ref={menuRef} style={{ top: position.y, left: position.x }} className="absolute bg-white rounded-lg shadow-2xl border border-gray-200 w-56 z-20 animate-fade-in text-sm">
            <div className="p-2 border-b">
                <p className="font-semibold text-gray-800 truncate">{sourceNode.label}</p>
            </div>
            <div className="max-h-60 overflow-y-auto">
                <p className="text-xs font-semibold uppercase text-gray-400 px-3 pt-2 pb-1">Explain connection to...</p>
                <ul>
                    {allNodes.filter(n => n.id !== sourceNode.id).map(targetNode => (
                         <li key={targetNode.id}>
                             <button onClick={() => { onExplainConnection(targetNode); onClose(); }} className="w-full text-left px-3 py-1.5 text-gray-700 hover:bg-gray-100 transition truncate">
                                 {targetNode.label}
                             </button>
                         </li>
                    ))}
                </ul>
            </div>
        </div>
    );
};

interface ConnectionExplanationModalProps {
    isOpen: boolean;
    onClose: () => void;
    sourceNode: KnowledgeNode | null;
    targetNode: KnowledgeNode | null;
    caseTitle: string;
    language: string;
    T: Record<string, any>;
}

const ConnectionExplanationModal: React.FC<ConnectionExplanationModalProps> = ({ isOpen, onClose, sourceNode, targetNode, caseTitle, language, T }) => {
    const [explanation, setExplanation] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    useEffect(() => {
        if (isOpen && sourceNode && targetNode) {
            const fetchExplanation = async () => {
                setIsLoading(true);
                setExplanation('');
                try {
                    const result = await getConceptConnectionExplanation(sourceNode.label, targetNode.label, caseTitle, language);
                    setExplanation(result);
                } catch (error) {
                    console.error("Failed to get connection explanation", error);
                    setExplanation(T.errorAbstract);
                } finally {
                    setIsLoading(false);
                }
            };
            fetchExplanation();
        }
    }, [isOpen, sourceNode, targetNode, caseTitle, language, T]);

    if (!isOpen) return null;

    return (
         <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-40 p-4 animate-fade-in" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
                 <header className="p-4 border-b border-gray-200">
                    <h2 className="text-lg font-bold text-gray-800">{T.connectionExplanationTitle}</h2>
                    <p className="text-sm text-gray-500 mt-1">{sourceNode?.label} &rarr; {targetNode?.label}</p>
                 </header>
                 <main className="p-6 min-h-[120px]">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center text-gray-500">
                           <svg className="animate-spin h-6 w-6 text-brand-blue mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                               <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                               <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                           </svg>
                           <p className="mt-2 text-sm">{T.explainingConnection}</p>
                        </div>
                    ) : (
                        <p className="text-gray-700 whitespace-pre-wrap">{explanation}</p>
                    )}
                 </main>
                 <footer className="p-3 border-t border-gray-200 text-right bg-gray-50">
                    <button onClick={onClose} className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300">
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
};

// Fix: Add export for DisciplineColors
export const DisciplineColors: Record<Discipline, string> = {
    [Discipline.BIOCHEMISTRY]: '#4A90E2', // A bright blue
    [Discipline.PHARMACOLOGY]: '#50E3C2', // A teal/cyan
    [Discipline.PHYSIOLOGY]: '#B8E986', // A light green
    [Discipline.PSYCHOLOGY]: '#F5A623', // An orange
    [Discipline.SOCIOLOGY]: '#F8E71C', // A yellow
    [Discipline.PATHOLOGY]: '#D0021B', // A strong red
    [Discipline.IMMUNOLOGY]: '#BD10E0', // A purple
    [Discipline.GENETICS]: '#9013FE', // A deep purple
    [Discipline.DIAGNOSTICS]: '#417505', // A darker green
    [Discipline.TREATMENT]: '#7ED321', // A bright green
    [Discipline.PHYSIOTHERAPY]: '#E0A410', // A gold
    [Discipline.OCCUPATIONAL_THERAPY]: '#03A9F4', // A light blue
};

interface KnowledgeMapProps {
    data: KnowledgeMapData;
    onNodeClick: (node: KnowledgeNode) => void;
    selectedNodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean } | null;
    onClearSelection: () => void;
    isMapFullscreen: boolean;
    setIsMapFullscreen: (isFullscreen: boolean) => void;
    caseTitle: string;
    language: string;
    T: Record<string, any>;
    onDiscussNode: (nodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean }) => void;
}

export const KnowledgeMap = forwardRef<any, KnowledgeMapProps>(({
    data,
    onNodeClick,
    selectedNodeInfo,
    onClearSelection,
    isMapFullscreen,
    setIsMapFullscreen,
    caseTitle,
    language,
    T,
    onDiscussNode
}, ref) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const simulationRef = useRef<any>();
    const zoomRef = useRef<any>();
    const gRef = useRef<any>();

    const [contextMenu, setContextMenu] = useState<{ position: { x: number; y: number }; node: KnowledgeNode } | null>(null);
    const [explanationModal, setExplanationModal] = useState<{ source: KnowledgeNode; target: KnowledgeNode } | null>(null);

    const nodes = useMemo(() => data.nodes.map(n => ({ ...n })), [data.nodes]);
    const links = useMemo(() => data.links.map(l => ({ ...l })), [data.links]);

    useImperativeHandle(ref, () => ({
        async captureAsImage(): Promise<string> {
            if (svgRef.current) {
                return await svgToDataURL(svgRef.current);
            }
            return '';
        }
    }));

    const handleNodeRightClick = (event: MouseEvent, node: KnowledgeNode) => {
        event.preventDefault();
        setContextMenu({ position: { x: event.clientX, y: event.clientY }, node });
    };

    const handleExplainConnection = (targetNode: KnowledgeNode) => {
        if (contextMenu) {
            setExplanationModal({ source: contextMenu.node, target: targetNode });
        }
    };
    
    const resetZoom = useCallback(() => {
        if (!svgRef.current || !gRef.current || !containerRef.current || !zoomRef.current) return;
        const svg = d3.select(svgRef.current);
        const g = gRef.current;

        const bounds = g.node().getBBox();
        const parent = svg.node().parentElement;
        if (!parent) return;

        const fullWidth = parent.clientWidth;
        const fullHeight = parent.clientHeight;
        const { width, height, x, y } = bounds;
        
        if (width === 0 || height === 0) return;

        const midX = x + width / 2;
        const midY = y + height / 2;
        const scale = 0.9 / Math.max(width / fullWidth, height / fullHeight);
        const translate = [fullWidth / 2 - scale * midX, fullHeight / 2 - scale * midY];

        const transform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);

        svg.transition().duration(750).call(zoomRef.current.transform, transform);
    }, []);
    
    const handleZoomIn = useCallback(() => {
        if (zoomRef.current && svgRef.current) {
            d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1.2);
        }
    }, []);

    const handleZoomOut = useCallback(() => {
        if (zoomRef.current && svgRef.current) {
            d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 0.8);
        }
    }, []);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;
        
        setIsLoading(true);

        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove(); // Clear previous render

        const { width, height } = containerRef.current.getBoundingClientRect();

        const g = svg.append('g');
        gRef.current = g;
        
        const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (event: any) => {
            g.attr('transform', event.transform);
        });
        zoomRef.current = zoom;
        svg.call(zoom);

        simulationRef.current = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(150))
            .force('charge', d3.forceManyBody().strength(-300))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .on('end', () => {
                setIsLoading(false);
                resetZoom();
            });

        const link = g.append('g')
            .attr('stroke', '#999')
            .attr('stroke-opacity', 0.6)
            .selectAll('line')
            .data(links)
            .join('line')
            .attr('stroke-width', 1.5);

        const node = g.append('g')
            .selectAll('g')
            .data(nodes)
            .join('g')
            .attr('class', 'cursor-pointer')
            .call(d3.drag()
                .on('start', (event: any, d: any) => {
                    if (!event.active) simulationRef.current.alphaTarget(0.3).restart();
                    d.fx = d.x;
                    d.fy = d.y;
                })
                .on('drag', (event: any, d: any) => {
                    d.fx = event.x;
                    d.fy = event.y;
                })
                .on('end', (event: any, d: any) => {
                    if (!event.active) simulationRef.current.alphaTarget(0);
                    d.fx = null;
                    d.fy = null;
                }))
            .on('click', (event: MouseEvent, d: any) => onNodeClick(d))
            .on('contextmenu', (event: MouseEvent, d: any) => handleNodeRightClick(event, d));

        node.append('circle')
            .attr('r', 12)
            .attr('fill', (d: any) => DisciplineColors[d.discipline] || '#ccc')
            .attr('stroke', '#fff')
            .attr('stroke-width', 2);
            
        node.append('text')
            .text((d: any) => d.label)
            .attr('x', 16)
            .attr('y', 4)
            .attr('font-size', '12px')
            .attr('font-weight', 500)
            .attr('fill', '#333');

        simulationRef.current.on('tick', () => {
            link.attr('x1', (d: any) => d.source.x)
                .attr('y1', (d: any) => d.source.y)
                .attr('x2', (d: any) => d.target.x)
                .attr('y2', (d: any) => d.target.y);
            node.attr('transform', (d: any) => `translate(${d.x}, ${d.y})`);
        });

        return () => {
            simulationRef.current.stop();
        };
    }, [data, nodes, links, onNodeClick, resetZoom]);
    
    useEffect(() => {
        if(isMapFullscreen) {
            setTimeout(resetZoom, 100);
        }
    }, [isMapFullscreen, resetZoom]);
    
    return (
        <div ref={containerRef} className="relative w-full h-full bg-slate-50 rounded-lg shadow-inner border border-gray-200 overflow-hidden">
            {isLoading && <LoadingSpinner />}
            <svg ref={svgRef} className="w-full h-full"></svg>
            <MapControls
                onZoomIn={handleZoomIn}
                onZoomOut={handleZoomOut}
                onReset={resetZoom}
                onToggleFullscreen={() => setIsMapFullscreen(!isMapFullscreen)}
                isFullscreen={isMapFullscreen}
            />
            {selectedNodeInfo && <ConceptCard nodeInfo={selectedNodeInfo} onClose={onClearSelection} onDiscuss={onDiscussNode} T={T} />}

            <ContextMenu 
                position={contextMenu?.position || null} 
                onClose={() => setContextMenu(null)} 
                onExplainConnection={handleExplainConnection}
                sourceNode={contextMenu?.node || null}
                allNodes={nodes}
            />

            <ConnectionExplanationModal
                isOpen={!!explanationModal}
                onClose={() => setExplanationModal(null)}
                sourceNode={explanationModal?.source || null}
                targetNode={explanationModal?.target || null}
                caseTitle={caseTitle}
                language={language}
                T={T}
            />
        </div>
    );
});