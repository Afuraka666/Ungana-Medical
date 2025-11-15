import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { Discipline } from '../types';
import type { KnowledgeMapData, KnowledgeNode } from '../types';
import { ConceptCard } from './ConceptCard';
import { getConceptConnectionExplanation } from '../services/geminiService';

declare const d3: any;

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
        <div className="absolute bottom-3 right-3 flex flex-col gap-2 z-10">
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
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 8a1 1 0 011-1h4a1 1 0 110 2H5v3a1 1 0 11-2 0V8zm14 4a1 1 0 01-1 1h-4a1 1 0 110-2h3V8a1 1 0 112 0v4z" clipRule="evenodd" /></svg>
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
                           <svg className="animate-spin h-6 w-6 text-brand-blue mb-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                           <span>{T.explainingConnection}</span>
                        </div>
                    ) : (
                        <p className="text-sm text-gray-700">{explanation}</p>
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


// --- COLOR MAPPING ---
export const DisciplineColors: Record<Discipline, string> = {
  [Discipline.BIOCHEMISTRY]: '#ef4444', // Red
  [Discipline.PHARMACOLOGY]: '#3b82f6', // Blue
  [Discipline.PHYSIOLOGY]: '#10b981', // Emerald
  [Discipline.PSYCHOLOGY]: '#8b5cf6', // Violet
  [Discipline.SOCIOLOGY]: '#f97316', // Orange
  [Discipline.PATHOLOGY]: '#6366f1', // Indigo
  [Discipline.IMMUNOLOGY]: '#14b8a6', // Teal
  [Discipline.GENETICS]: '#d946ef', // Fuchsia
  [Discipline.DIAGNOSTICS]: '#6b7280', // Gray
  [Discipline.TREATMENT]: '#22c55e', // Green
  [Discipline.PHYSIOTHERAPY]: '#0ea5e9', // Sky
  [Discipline.OCCUPATIONAL_THERAPY]: '#f59e0b', // Amber
};

// --- MAIN COMPONENT ---
interface KnowledgeMapProps {
  data: KnowledgeMapData | null;
  onNodeClick: (node: KnowledgeNode) => void;
  selectedNodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean } | null;
  onClearSelection: () => void;
  isMapFullscreen: boolean;
  setIsMapFullscreen: (isMapFullscreen: boolean) => void;
  caseTitle: string;
  language: string;
  T: Record<string, any>;
}

export const KnowledgeMap: React.FC<KnowledgeMapProps> = ({
  data,
  onNodeClick,
  selectedNodeInfo,
  onClearSelection,
  isMapFullscreen,
  setIsMapFullscreen,
  caseTitle,
  language,
  T,
}) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simulationRef = useRef<any>();
  const zoomRef = useRef<any>();
  const elementsRef = useRef<{ g?: any, node?: any, link?: any, linkpath?: any, linklabel?: any }>({});
  const componentId = `map-${useRef(Math.random().toString(36).substr(2, 9)).current}`;

  const [filteredNodes, setFilteredNodes] = useState<KnowledgeNode[] | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeDisciplineFilters, setActiveDisciplineFilters] = useState<Discipline[]>([]);

  const [contextMenu, setContextMenu] = useState<{ position: { x: number, y: number }, sourceNode: KnowledgeNode } | null>(null);
  const [connectionToExplain, setConnectionToExplain] = useState<{ source: KnowledgeNode, target: KnowledgeNode } | null>(null);

  const availableDisciplines = useMemo(() => {
    if (!data?.nodes) return [];
    const disciplines = new Set<Discipline>();
    data.nodes.forEach(node => disciplines.add(node.discipline));
    return Array.from(disciplines).sort((a, b) => a.localeCompare(b));
  }, [data]);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const term = e.target.value;
      setSearchTerm(term);
      if (!term) {
          setFilteredNodes(null);
      } else if (data) {
          setFilteredNodes(data.nodes.filter(n => n.label.toLowerCase().includes(term.toLowerCase())));
      }
  };

  const handleFilterToggle = (discipline: Discipline) => {
    setActiveDisciplineFilters(prev => {
        const newSet = new Set(prev);
        if (newSet.has(discipline)) {
            newSet.delete(discipline);
        } else {
            newSet.add(discipline);
        }
        return Array.from(newSet);
    });
  };

  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
        d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
        d3.select(svgRef.current).transition().duration(250).call(zoomRef.current.scaleBy, 0.8);
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current && containerRef.current) {
        const svg = d3.select(svgRef.current);
        const g = elementsRef.current.g;

        const parent = svg.node().parentElement;
        if (!g.node() || !parent) return;
        
        const bounds = g.node().getBBox();
        const fullWidth = parent.clientWidth;
        const fullHeight = parent.clientHeight;

        if (bounds.width === 0 || bounds.height === 0) return;
        
        const scale = Math.min(0.9, 0.9 / Math.max(bounds.width / fullWidth, bounds.height / fullHeight));
        const translate = [
            fullWidth / 2 - scale * (bounds.x + bounds.width / 2),
            fullHeight / 2 - scale * (bounds.y + bounds.height / 2)
        ];

        const transform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);

        svg.transition().duration(750).call(zoomRef.current.transform, transform);
    }
  }, []);

  const handleNodeContextMenu = useCallback((event: MouseEvent, d: KnowledgeNode) => {
      event.preventDefault();
      onNodeClick(d);
      setContextMenu({
          position: { x: event.clientX, y: event.clientY },
          sourceNode: d
      });
  }, [onNodeClick]);
  
  const handleExplainConnection = useCallback((targetNode: KnowledgeNode) => {
      if (contextMenu?.sourceNode) {
          setConnectionToExplain({ source: contextMenu.sourceNode, target: targetNode });
      }
  }, [contextMenu]);

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const { nodes, links } = data;
    if (!nodes || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append('defs');
    defs.html(`
      <marker id="arrow-${componentId}" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#6B7280"></path>
      </marker>
      <marker id="arrow-selected-${componentId}" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#1e3a8a"></path>
      </marker>
      <filter id="glow-${componentId}" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="coloredBlur"></feGaussianBlur>
        <feMerge>
          <feMergeNode in="coloredBlur"></feMergeNode>
          <feMergeNode in="SourceGraphic"></feMergeNode>
        </feMerge>
      </filter>
    `);

    simulationRef.current = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(150).strength(0.6))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(containerRef.current.clientWidth / 2, containerRef.current.clientHeight / 2))
      .force("collision", d3.forceCollide().radius((d: any) => d.label.length / 2 + 25));
    
    const g = svg.append("g");
    elementsRef.current.g = g;

    const link = g.append("g").selectAll("g").data(links).join("g");
    const linkpath = link.append("path").attr("fill", "none").attr("stroke-width", 2).attr("stroke", "#9ca3af").attr("marker-end", `url(#arrow-${componentId})`);
    const linklabel = link.append("text").text((d: any) => d.description).attr("dy", "-5").attr("text-anchor", "middle").attr("font-size", "9px").attr("fill", "#4b5563");
    elementsRef.current.link = link;
    elementsRef.current.linkpath = linkpath;
    elementsRef.current.linklabel = linklabel;

    const node = g.append("g").selectAll("g").data(nodes).join("g").attr("cursor", "pointer");
    const getRadius = (d: any) => d.label.length / 2 + 10;
    node.append("circle").attr("r", getRadius).attr("stroke", "#fff").attr("stroke-width", 3).attr("fill", (d: any) => DisciplineColors[d.discipline] || '#ccc');
    
    // Add tooltip with node label and discipline
    node.append("title").text((d: any) => `${d.label}\nDiscipline: ${d.discipline}`);

    node.append("text").text((d: any) => d.label).attr("text-anchor", "middle").attr("dy", ".3em").attr("font-size", "11px").attr("font-weight", "600").attr("fill", "#000").style("pointer-events", "none");
    elementsRef.current.node = node;

    const drag = d3.drag().on("start", (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on("drag", (event: any, d: any) => { d.fx = event.x; d.fy = event.y; }).on("end", (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0); d.fx = null; d.fy = null; });
    node.call(drag);
    
    zoomRef.current = d3.zoom().scaleExtent([0.1, 2.5]).on("zoom", (event: any) => g.attr("transform", event.transform));
    svg.call(zoomRef.current);
    
    handleResetZoom();
    
    node.on("click", (event: any, d: any) => {
        onNodeClick(d);
        setContextMenu(null);
    });

    node.on("contextmenu", handleNodeContextMenu);
    svg.on("click", () => {
        onClearSelection();
        setContextMenu(null);
    });

    simulationRef.current.on("tick", () => {
        node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);

        linkpath.attr('d', (d: any) => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist === 0) return `M${d.source.x},${d.source.y}L${d.target.x},${d.target.y}`;

            const sourceRadius = getRadius(d.source) + 2; // +2 for stroke width buffer
            const targetRadius = getRadius(d.target) + 5; // +5 to account for arrowhead size
            
            const startX = d.source.x + (dx / dist) * sourceRadius;
            const startY = d.source.y + (dy / dist) * sourceRadius;

            const endX = d.target.x - (dx / dist) * targetRadius;
            const endY = d.target.y - (dy / dist) * targetRadius;
            
            return `M${startX},${startY}L${endX},${endY}`;
        });

        linklabel.attr("transform", function(d: any) {
             return `translate(${(d.source.x + d.target.x) / 2},${(d.source.y + d.target.y) / 2})`;
        });
    });

    return () => simulationRef.current.stop();
  }, [data, componentId, isMapFullscreen, handleResetZoom, onNodeClick, onClearSelection, handleNodeContextMenu]);

  useEffect(() => {
    const { node, link, linkpath } = elementsRef.current;
    if (!node || !link || !linkpath) return;

    const selectedId = selectedNodeInfo?.node.id;
    const hasActiveFilters = activeDisciplineFilters.length > 0;
    const activeFilterSet = new Set(activeDisciplineFilters);

    // --- Node Styles ---
    node.transition().duration(200)
        .style("opacity", (d: any) => {
            if (selectedId) {
                // Selection logic takes precedence
                return d.id === selectedId ? 1.0 : 0.3;
            }
            if (hasActiveFilters) {
                // Filter logic
                return activeFilterSet.has(d.discipline) ? 1.0 : 0.15;
            }
            // Default: all visible
            return 1.0;
        })
        .style("filter", (d: any) => d.id === selectedId ? `url(#glow-${componentId})` : null);

    node.select('circle').transition().duration(200)
        .attr('stroke', (d: any) => d.id === selectedId ? DisciplineColors[d.discipline as Discipline] : '#fff');

    // --- Link Styles ---
    link.transition().duration(200)
        .style("opacity", (d: any) => {
            if (selectedId) {
                // Selection logic
                const isConnected = d.source.id === selectedId || d.target.id === selectedId;
                return isConnected ? 1.0 : 0.2;
            }
            if (hasActiveFilters) {
                // Filter logic: link is visible if both its nodes are visible
                const sourceInFilter = activeFilterSet.has(d.source.discipline);
                const targetInFilter = activeFilterSet.has(d.target.discipline);
                return (sourceInFilter && targetInFilter) ? 1.0 : 0.1;
            }
            // Default: all visible
            return 1.0;
        });

    linkpath.transition().duration(200)
        .attr('stroke', (d: any) => (selectedId && (d.source.id === selectedId || d.target.id === selectedId)) ? '#1e3a8a' : '#9ca3af')
        .attr("marker-end", (d: any) => (selectedId && (d.source.id === selectedId || d.target.id === selectedId)) ? `url(#arrow-selected-${componentId})` : `url(#arrow-${componentId})`);

}, [selectedNodeInfo, activeDisciplineFilters, componentId]);

  return (
    <div ref={containerRef} className="bg-white rounded-lg shadow-lg border border-gray-200 w-full h-full overflow-hidden relative">
      {!data ? <LoadingSpinner /> : (
        <>
            <div className="absolute top-0 left-0 p-3 z-10 w-full sm:w-72">
                 <div className="relative">
                    <input
                        type="text"
                        placeholder={T.searchNodes}
                        value={searchTerm}
                        onChange={handleSearchChange}
                        className="w-full p-2 pl-8 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-brand-blue-light transition bg-white/80 backdrop-blur-sm"
                    />
                    <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" /></svg>
                    </div>
                     {searchTerm && (
                        <div className="absolute mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-48 overflow-y-auto">
                            {filteredNodes && filteredNodes.length > 0 ? (
                                filteredNodes.map(node => (
                                    <button key={node.id} onClick={() => onNodeClick(node)} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 transition truncate">
                                        {node.label}
                                    </button>
                                ))
                            ) : (
                                <p className="p-3 text-sm text-gray-500">{T.noResults}</p>
                            )}
                        </div>
                    )}
                 </div>
            </div>
             <div className="absolute top-16 left-3 z-10 flex flex-wrap gap-1.5 max-w-md">
                {availableDisciplines.map(discipline => {
                    const isActive = activeDisciplineFilters.includes(discipline);
                    return (
                        <button
                            key={discipline}
                            onClick={() => handleFilterToggle(discipline)}
                            className={`px-2 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1.5 transition border shadow-sm ${
                                isActive
                                ? 'bg-white text-brand-blue border-brand-blue-light ring-2 ring-brand-blue-light/50'
                                : 'bg-white/80 backdrop-blur-sm border-gray-200 text-gray-700 hover:border-gray-400'
                            }`}
                        >
                            <span className="w-2 h-2 rounded-full" style={{ backgroundColor: DisciplineColors[discipline] }}></span>
                            {discipline}
                        </button>
                    );
                })}
                {activeDisciplineFilters.length > 0 && (
                    <button
                        onClick={() => setActiveDisciplineFilters([])}
                        title="Clear filters"
                        className="px-2 py-0.5 text-xs font-semibold rounded-full flex items-center gap-1.5 transition border shadow-sm bg-red-100 text-red-700 border-red-200 hover:bg-red-200"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg>
                        Clear
                    </button>
                )}
            </div>
          <svg ref={svgRef} className="w-full h-full"></svg>
          <MapControls onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onReset={handleResetZoom} onToggleFullscreen={() => setIsMapFullscreen(!isMapFullscreen)} isFullscreen={isMapFullscreen} />
          {selectedNodeInfo && <ConceptCard nodeInfo={selectedNodeInfo} onClose={onClearSelection} />}
           <ContextMenu
                position={contextMenu?.position || null}
                onClose={() => setContextMenu(null)}
                onExplainConnection={handleExplainConnection}
                sourceNode={contextMenu?.sourceNode || null}
                allNodes={data?.nodes || []}
            />
             <ConnectionExplanationModal
                isOpen={!!connectionToExplain}
                onClose={() => setConnectionToExplain(null)}
                sourceNode={connectionToExplain?.source || null}
                targetNode={connectionToExplain?.target || null}
                caseTitle={caseTitle}
                language={language}
                T={T}
            />
        </>
      )}
    </div>
  );
};