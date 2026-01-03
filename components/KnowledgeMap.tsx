
import React, { useEffect, useRef, useCallback, useState, useMemo, forwardRef, useImperativeHandle } from 'react';
import { Discipline } from '../types';
import type { KnowledgeMapData, KnowledgeNode, KnowledgeLink } from '../types';
import { ConceptCard } from './ConceptCard';

declare const d3: any;

export const DisciplineColors: Record<string, string> = {
    [Discipline.BIOCHEMISTRY]: '#2563EB',
    [Discipline.PHARMACOLOGY]: '#059669',
    [Discipline.PHYSIOLOGY]: '#7C3AED',
    [Discipline.PSYCHOLOGY]: '#D97706',
    [Discipline.SOCIOLOGY]: '#DB2777',
    [Discipline.PATHOLOGY]: '#DC2626',
    [Discipline.IMMUNOLOGY]: '#0891B2',
    [Discipline.GENETICS]: '#EA580C',
    [Discipline.DIAGNOSTICS]: '#475569',
    [Discipline.TREATMENT]: '#16A34A',
    [Discipline.PHYSIOTHERAPY]: '#06B6D4',
    [Discipline.OCCUPATIONAL_THERAPY]: '#9333EA',
    [Discipline.ANAESTHESIA]: '#334155',
    [Discipline.PAIN_MANAGEMENT]: '#9A3412',
    [Discipline.NURSING]: '#BE185D',
    [Discipline.NUTRITION]: '#B45309',
    [Discipline.SOCIAL_WORK]: '#374151',
    [Discipline.SPEECH_LANGUAGE_THERAPY]: '#4338CA',
};

// Randomized color generator for unique node identity
const getNodeColor = (id: string, index: number) => {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = (Math.abs(hash) + (index * 137)) % 360; 
    return `hsl(${hue}, 65%, 45%)`;
};

const svgToDataURL = async (svgEl: SVGSVGElement): Promise<string> => {
    const g = svgEl.querySelector('g');
    if (!g) return '';
    const bbox = g.getBBox();
    if (bbox.width === 0 || bbox.height === 0) return '';
    const padding = 40;
    const width = bbox.width + padding * 2;
    const height = bbox.height + padding * 2;
    const svgClone = svgEl.cloneNode(true) as SVGSVGElement;
    svgClone.setAttribute('width', width.toString());
    svgClone.setAttribute('height', height.toString());
    svgClone.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${width} ${height}`);
    const gClone = svgClone.querySelector('g');
    if (gClone) gClone.removeAttribute('transform');
    const bgRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bgRect.setAttribute('width', width.toString());
    bgRect.setAttribute('height', height.toString());
    bgRect.setAttribute('fill', 'white');
    bgRect.setAttribute('x', `${bbox.x - padding}`);
    bgRect.setAttribute('y', `${bbox.y - padding}`);
    svgClone.prepend(bgRect);
    const xml = new XMLSerializer().serializeToString(svgClone);
    const svg64 = btoa(unescape(encodeURIComponent(xml)));
    const image64 = `data:image/svg+xml;base64,${svg64}`;
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = 2;
            canvas.width = width * scale;
            canvas.height = height * scale;
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.scale(scale, scale);
                ctx.drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/png', 1.0));
            } else resolve('');
        };
        img.onerror = () => resolve('');
        img.src = image64;
    });
};

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center h-full p-4 text-brand-blue dark:text-brand-blue-light">
        <svg className="animate-spin h-8 w-8" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

function intersectRect(rect: any, point: any) {
    const cx = rect.x;
    const cy = rect.y;
    const dx = point.x - cx;
    const dy = point.y - cy;
    const w = (rect.pillWidth || 0) / 2;
    const h = (rect.pillHeight || 0) / 2;
    if (w === 0 || h === 0) return { x: cx, y: cy }; 
    
    if (Math.abs(dy * w) < Math.abs(dx * h)) {
        if (dx > 0) return { x: cx + w, y: cy + dy * w / dx };
        else return { x: cx - w, y: cy - dy * w / dx };
    } else {
        if (dy > 0) return { x: cx + dx * h / dy, y: cy + h };
        else return { x: cx - dx * h / dy, y: cy - h };
    }
}

interface MapControlsProps {
    onZoomIn: () => void;
    onZoomOut: () => void;
    onReset: () => void;
    onToggleFullscreen: () => void;
    onSaveMap?: () => void;
    isFullscreen: boolean;
}

const MapControls: React.FC<MapControlsProps> = ({ onZoomIn, onZoomOut, onReset, onToggleFullscreen, onSaveMap, isFullscreen }) => {
    const buttonClasses = "bg-white/95 dark:bg-slate-800/95 backdrop-blur-sm hover:bg-white dark:hover:bg-slate-700 text-gray-700 dark:text-slate-200 shadow-xl border border-gray-200 dark:border-dark-border rounded-lg w-10 h-10 flex items-center justify-center transition-all hover:scale-110 active:scale-90";
    return (
        <div className="absolute top-3 left-3 flex flex-col gap-2 z-10">
            <button onClick={onZoomIn} title="Zoom In" className={buttonClasses}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 5.414V8a1 1 0 01-2 0V4zm9 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V5.414l-2.293 2.293a1 1 0 11-1.414-1.414L14.586 5H13a1 1 0 01-1-1zm1 12a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 14.586V12a1 1 0 112 0v4a1 1 0 01-1 1h-4zm-7 0a1 1 0 01-1 1H4a1 1 0 01-1-1v-4a1 1 0 112 v2.586l2.293-2.293a1 1 0 111.414 1.414L5.414 15H8a1 1 0 011 1z" clipRule="evenodd" /></svg>
            </button>
            <button onClick={onZoomOut} title="Zoom Out" className={buttonClasses}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
            </button>
            <button onClick={onReset} title="Reset View" className={buttonClasses}>
                 <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L9.414 11H13a1 1 0 100-2H9.414l1.293-1.293z" clipRule="evenodd" /></svg>
            </button>
             <button onClick={onToggleFullscreen} title={isFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} className={buttonClasses}>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 4a1 1 0 011-1h4a1 1 0 010 2H6.414l2.293 2.293a1 1 0 11-1.414 1.414L5 5.414V8a1 1 0 01-2 0V4zm9 0a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 11-2 0V5.414l-2.293 2.293a1 1 0 11-1.414-1.414L14.586 5H13a1 1 0 01-1-1zm1 12a1 1 0 010-2h1.586l-2.293-2.293a1 1 0 111.414-1.414L15 14.586V12a1 1 0 112 0v4a1 1 0 01-1 1h-4zm-7 0a1 1 0 01-1 1H4a1 1 0 01-1-1v-4a1 1 0 112 v2.586l2.293-2.293a1 1 0 111.414 1.414L5.414 15H8a1 1 0 011 1z" clipRule="evenodd" /></svg>
            </button>
            {onSaveMap && (
                <button onClick={onSaveMap} title="Save Map to Collection" className={`${buttonClasses} text-brand-blue`}>
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M5 4a2 2 0 012-2h6a2 2 0 012 2v12a1 1 0 01-1.447.894L10 14.586l-3.553 2.308A1 1 0 015 16V4z" /></svg>
                </button>
            )}
        </div>
    );
};

const NodeTooltip: React.FC<{ node: KnowledgeNode | null; position: { x: number; y: number } | null }> = ({ node, position }) => {
    if (!node || !position) return null;
    return (
        <div 
            className="fixed z-[100] bg-white dark:bg-slate-800 border-2 border-brand-blue/30 dark:border-brand-blue-light/20 p-3 rounded-lg shadow-2xl pointer-events-none max-w-[240px] animate-fade-in"
            style={{ top: position.y + 15, left: position.x + 15 }}
        >
            <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">{node.discipline}</span>
            </div>
            <h4 className="font-bold text-sm text-gray-800 dark:text-white mb-1.5">{node.label}</h4>
            <p className="text-xs text-gray-600 dark:text-slate-300 leading-relaxed italic line-clamp-4">{node.summary}</p>
        </div>
    );
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
    onSaveMap?: () => void;
}

export const KnowledgeMap = forwardRef<any, KnowledgeMapProps>(({ data, onNodeClick, selectedNodeInfo, onClearSelection, isMapFullscreen, setIsMapFullscreen, caseTitle, language, T, onDiscussNode, onSaveMap }, ref) => {
    const svgRef = useRef<SVGSVGElement | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const simulationRef = useRef<any>(null);
    const zoomRef = useRef<any>(null);
    const gRef = useRef<any>(null);
    const [hoveredNode, setHoveredNode] = useState<{ node: KnowledgeNode; position: { x: number; y: number } } | null>(null);
    const [hoveredLink, setHoveredLink] = useState<KnowledgeLink | null>(null);
    
    const nodes = useMemo(() => data.nodes.map(n => ({ ...n })), [data.nodes]);
    const links = useMemo(() => data.links.map(l => ({ ...l })), [data.links]);

    useImperativeHandle(ref, () => ({ async captureAsImage() { if (svgRef.current) return await svgToDataURL(svgRef.current); return ''; } }));
    
    const resetZoom = useCallback(() => {
        if (!svgRef.current || !gRef.current || !containerRef.current || !zoomRef.current) return;
        const svg = d3.select(svgRef.current);
        const g = gRef.current;
        const bounds = g.node().getBBox();
        const { width, height } = containerRef.current.getBoundingClientRect();
        if (bounds.width === 0 || bounds.height === 0) return;
        const scale = Math.min(1.2, 0.85 / Math.max(bounds.width / width, bounds.height / height));
        const transform = d3.zoomIdentity.translate(width / 2 - scale * (bounds.x + bounds.width / 2), height / 2 - scale * (bounds.y + bounds.height / 2)).scale(scale);
        svg.transition().duration(750).call(zoomRef.current.transform, transform);
    }, []);

    useEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(() => {
            window.requestAnimationFrame(() => {
                if (svgRef.current && gRef.current && !isLoading) {
                    const { width, height } = containerRef.current!.getBoundingClientRect();
                    if (width > 0 && height > 0 && simulationRef.current) {
                        simulationRef.current.force('center', d3.forceCenter(width / 2, height / 2));
                        simulationRef.current.alpha(0.1).restart();
                    }
                }
            });
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [isLoading]);

    useEffect(() => {
        if (!svgRef.current || !containerRef.current) return;
        setIsLoading(true);
        const svg = d3.select(svgRef.current);
        svg.selectAll('*').remove();
        
        svg.append('defs').append('marker')
            .attr('id', 'map-arrowhead')
            .attr('viewBox', '0 -5 10 10')
            .attr('refX', 8)
            .attr('refY', 0)
            .attr('markerWidth', 7) // Slightly larger
            .attr('markerHeight', 7) // Slightly larger
            .attr('orient', 'auto')
            .append('path')
            .attr('d', 'M0,-5L10,0L0,5')
            .attr('fill', '#94a3b8');

        const { width, height } = containerRef.current.getBoundingClientRect();
        const g = svg.append('g'); gRef.current = g;
        const zoom = d3.zoom().scaleExtent([0.1, 4]).on('zoom', (event: any) => g.attr('transform', event.transform));
        zoomRef.current = zoom; svg.call(zoom);
        
        simulationRef.current = d3.forceSimulation(nodes)
            .force('link', d3.forceLink(links).id((d: any) => d.id).distance(220).strength(0.6))
            .force('charge', d3.forceManyBody().strength(-2500))
            .force('center', d3.forceCenter(width / 2, height / 2))
            .force('collide', d3.forceCollide().radius(120).iterations(2))
            .velocityDecay(0.4)
            .on('end', () => { setIsLoading(false); resetZoom(); });

        const linkPaths = g.append("g").selectAll("path").data(links).join("path")
            .attr("fill", "none")
            .attr("stroke", "#cbd5e1")
            .attr("stroke-opacity", 0.6)
            .attr("stroke-width", 3.5) // Increased thickness
            .attr("marker-end", "url(#map-arrowhead)")
            .attr("class", "link-path transition-all cursor-help")
            .on('mouseenter', (event: any, d: any) => {
                d3.select(event.currentTarget).attr("stroke", "#3b82f6").attr("stroke-opacity", 1).attr("stroke-width", 4.5);
                setHoveredLink(d);
            })
            .on('mouseleave', (event: any) => {
                d3.select(event.currentTarget).attr("stroke", "#cbd5e1").attr("stroke-opacity", 0.6).attr("stroke-width", 3.5);
                setHoveredLink(null);
            });

        const node = g.append('g').selectAll('g').data(nodes).join('g').attr('class', 'node-group cursor-pointer')
            .call(d3.drag().on('start', (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on('drag', (event: any, d: any) => { d.fx = event.x; d.fy = event.y; }).on('end', (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0); d.fx = null; d.fy = null; }))
            .on('click', (event: MouseEvent, d: any) => { event.stopPropagation(); onNodeClick(d); })
            .on('mouseenter', (event: MouseEvent, d: any) => {
                setHoveredNode({ node: d, position: { x: event.clientX, y: event.clientY } });
                d3.select(event.currentTarget as any).select('rect').transition().duration(200).attr('stroke-width', 4).attr('stroke', '#3b82f6');
            })
            .on('mousemove', (event: MouseEvent) => {
                setHoveredNode(prev => prev ? { ...prev, position: { x: event.clientX, y: event.clientY } } : null);
            })
            .on('mouseleave', (event: MouseEvent) => {
                setHoveredNode(null);
                d3.select(event.currentTarget as any).select('rect').transition().duration(200).attr('stroke-width', 2.5).attr('stroke', '#ffffff');
            });

        node.append('rect')
            .attr('rx', 25).attr('ry', 25)
            .attr('fill', (d: any, i: number) => getNodeColor(d.id, i)) // Randomized colors
            .attr('stroke', '#ffffff')
            .attr('stroke-width', 2.5)
            .attr('filter', 'drop-shadow(0px 4px 6px rgba(0,0,0,0.1))');

        node.append('text')
            .text((d: any) => d.label)
            .attr("font-family", "Inter, sans-serif")
            .attr('font-size', '13px')
            .attr('font-weight', '800')
            .attr('fill', '#ffffff')
            .attr('text-anchor', 'middle')
            .attr('dy', '0.15em')
            .each(function(d: any) { 
                const bbox = (this as any).getBBox(); 
                d.pillWidth = Math.max(120, bbox.width + 40); 
                d.pillHeight = 46; 
            });

        node.select('rect')
            .attr('width', (d: any) => d.pillWidth)
            .attr('height', (d: any) => d.pillHeight)
            .attr('x', (d: any) => -d.pillWidth / 2)
            .attr('y', (d: any) => -d.pillHeight / 2);

        node.append('text')
            .text((d: any) => (d.discipline || '').toUpperCase())
            .attr('font-size', '8px')
            .attr('font-weight', '900')
            .attr('fill', '#ffffff')
            .attr('opacity', 0.9)
            .attr('letter-spacing', '0.08em')
            .attr('text-anchor', 'middle')
            .attr('dy', '1.6em');

        simulationRef.current.on('tick', () => { 
            linkPaths.attr('d', (d: any) => {
                if (!d.source.x || !d.target.x) return null;
                const s = intersectRect(d.source, d.target);
                const t = intersectRect(d.target, d.source);
                const dx = t.x - s.x;
                const dy = t.y - s.y;
                const dr = Math.sqrt(dx * dx + dy * dy) * 1.5; 
                return `M${s.x},${s.y}A${dr},${dr} 0 0,1 ${t.x},${t.y}`;
            }); 
            node.attr('transform', (d: any) => `translate(${d.x}, ${d.y})`); 
        });

        return () => simulationRef.current.stop();
    }, [data, nodes, links, onNodeClick, resetZoom]);

    return (
        <div ref={containerRef} className={`w-full h-full bg-slate-50 dark:bg-slate-900 shadow-inner border border-gray-200 dark:border-dark-border overflow-hidden transition-colors duration-300 ${isMapFullscreen ? 'fixed inset-0 z-40' : 'relative rounded-xl'}`}>
            {isLoading && <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/50 dark:bg-dark-bg/50 backdrop-blur-sm"><LoadingSpinner /></div>}
            <svg ref={svgRef} className="w-full h-full touch-none" onClick={onClearSelection}></svg>
            <MapControls onZoomIn={() => zoomRef.current && d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1.3)} onZoomOut={() => zoomRef.current && d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 0.7)} onReset={resetZoom} onToggleFullscreen={() => setIsMapFullscreen(!isMapFullscreen)} onSaveMap={onSaveMap} isFullscreen={isMapFullscreen} />
            <NodeTooltip node={hoveredNode?.node || null} position={hoveredNode?.position || null} />
            
            {hoveredLink && (
                <div className="absolute bottom-4 right-4 bg-white/90 dark:bg-slate-800/90 p-2 px-3 rounded-lg shadow-lg border border-brand-blue/20 text-[10px] max-w-[200px] animate-fade-in pointer-events-none">
                    <p className="font-black uppercase text-gray-400 mb-1">Relationship</p>
                    <p className="text-gray-800 dark:text-slate-200 leading-tight italic font-medium">{hoveredLink.description}</p>
                </div>
            )}

            {selectedNodeInfo && <ConceptCard nodeInfo={selectedNodeInfo} onClose={onClearSelection} onDiscuss={onDiscussNode} T={T} />}
        </div>
    );
});
