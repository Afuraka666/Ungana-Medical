import React, { useEffect, useRef, useCallback } from 'react';
import { Discipline } from '../types';
import type { KnowledgeMapData, KnowledgeNode, KnowledgeLink } from '../types';
import { ConceptCard } from './ConceptCard';

declare const d3: any;

interface KnowledgeMapProps {
  data: KnowledgeMapData;
  onNodeClick: (node: KnowledgeNode) => void;
  selectedNodeInfo: { node: KnowledgeNode; abstract: string; loading: boolean } | null;
  onClearSelection: () => void;
  isMapFullscreen: boolean;
  setIsMapFullscreen: (isFullscreen: boolean) => void;
}

export const DisciplineColors: Record<Discipline, string> = {
  [Discipline.BIOCHEMISTRY]: "#3b82f6", // blue-500
  [Discipline.PHARMACOLOGY]: "#8b5cf6", // violet-500
  [Discipline.PHYSIOLOGY]: "#10b981", // emerald-500
  [Discipline.PSYCHOLOGY]: "#ec4899", // pink-500
  [Discipline.SOCIOLOGY]: "#f97316", // orange-500
  [Discipline.PATHOLOGY]: "#ef4444", // red-500
  [Discipline.IMMUNOLOGY]: "#14b8a6", // teal-500
  [Discipline.GENETICS]: "#d946ef", // fuchsia-500
  [Discipline.DIAGNOSTICS]: "#6366f1", // indigo-500
  [Discipline.TREATMENT]: "#22c55e", // green-500
};

export const KnowledgeMap: React.FC<KnowledgeMapProps> = ({ data, onNodeClick, selectedNodeInfo, onClearSelection, isMapFullscreen, setIsMapFullscreen }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const simulationRef = useRef<any>(null);
  const zoomRef = useRef<any>(null);
  const selectedNodeId = selectedNodeInfo?.node.id || null;

  const handleZoomIn = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
        d3.select(svgRef.current)
          .transition()
          .duration(250)
          .call(zoomRef.current.scaleBy, 1.2);
    }
  }, []);

  const handleZoomOut = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
        d3.select(svgRef.current)
          .transition()
          .duration(250)
          .call(zoomRef.current.scaleBy, 0.8);
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    if (svgRef.current && zoomRef.current) {
        d3.select(svgRef.current)
          .transition()
          .duration(250)
          .call(zoomRef.current.transform, d3.zoomIdentity);
    }
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const { nodes, links } = data;
    const svg = d3.select(svgRef.current);

    svg.selectAll("*").remove(); 

    const defs = svg.append('defs');
    defs.html(`
      <marker id="arrowhead-default" viewBox="0 0 10 10" refX="10" refY="5"
          markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#9ca3af"></path>
      </marker>
      <marker id="arrowhead-highlight" viewBox="0 0 10 10" refX="10" refY="5"
          markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M 0 2 L 10 5 L 0 8 z" fill="#1e3a8a"></path>
      </marker>
      <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="5" result="coloredBlur"></feGaussianBlur>
        <feMerge>
          <feMergeNode in="coloredBlur"></feMergeNode>
          <feMergeNode in="SourceGraphic"></feMergeNode>
        </feMerge>
      </filter>
      <style type="text/css">
        @keyframes pulse {
          0% { r: 14; }
          50% { r: 18; }
          100% { r: 14; }
        }
        .pulse-animation {
          animation: pulse 2s ease-in-out infinite;
        }
      </style>
    `);

    const g = svg.append("g");
    const tooltip = d3.select(containerRef.current).select("#d3-tooltip");
    
    const adjacency = new Map<string, Set<string>>(nodes.map(node => [node.id, new Set()]));
    links.forEach(link => {
        if (!link.source || !link.target) return;
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        if (adjacency.has(sourceId)) adjacency.get(sourceId)!.add(targetId);
        if (adjacency.has(targetId)) adjacency.get(targetId)!.add(sourceId);
    });

    if (!simulationRef.current) {
        simulationRef.current = d3.forceSimulation()
          .force("link", d3.forceLink().id((d: any) => d.id).distance(100))
          .force("charge", d3.forceManyBody().strength(-350));
    }
    const simulation = simulationRef.current;
    
    const link = g.append("g")
      .attr("stroke", "#9ca3af")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke-width", 2)
      .attr("marker-end", "url(#arrowhead-default)");

    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "pointer")
      .call(drag(simulation));

    const circles = node.append("circle")
      .attr("r", 12)
      .attr("fill", (d: KnowledgeNode) => DisciplineColors[d.discipline] || "#6b7280");

    const labels = node.append("text")
      .text((d: KnowledgeNode) => d.label)
      .attr("x", 16)
      .attr("y", 4)
      .attr("font-size", "12px")
      .attr("fill", "#1f2937")
      .attr("font-weight", "500")
      .style("pointer-events", "none");

    const zoom = d3.zoom()
        .scaleExtent([0.2, 5])
        .on("zoom", (event: any) => {
            g.attr("transform", event.transform);
        });
    zoomRef.current = zoom;
    svg.call(zoom);

    function ticked() {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return d.target.x;
            const targetRadius = d.target.id === selectedNodeId ? 14 : 12;
            return d.target.x - (dx / dist) * (targetRadius + 3);
        })
        .attr("y2", (d: any) => {
            const dx = d.target.x - d.source.x;
            const dy = d.target.y - d.source.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist === 0) return d.target.y;
            const targetRadius = d.target.id === selectedNodeId ? 14 : 12;
            return d.target.y - (dy / dist) * (targetRadius + 3);
        });
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    }

    function drag(simulation: any) {
      function dragstarted(event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      }
      function dragged(event: any, d: any) {
        d.fx = event.x;
        d.fy = event.y;
      }
      function dragended(event: any, d: any) {
        if (!event.active) simulation.alphaTarget(0);
        d.fx = null;
        d.fy = null;
      }
      return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
    }

    function updateHighlight() {
        const isAnyNodeSelected = selectedNodeId !== null;
        const connectedToSelected = new Set<string>();
        if (isAnyNodeSelected && selectedNodeId) {
            connectedToSelected.add(selectedNodeId);
            (adjacency.get(selectedNodeId) || new Set<string>()).forEach(neighborId => {
                connectedToSelected.add(neighborId);
            });
        }

        // Dim or highlight nodes based on selection
        node.transition().duration(200)
            .style("opacity", (d: KnowledgeNode) => !isAnyNodeSelected || connectedToSelected.has(d.id) ? 1 : 0.3);
        
        // Apply special styles to the selected node
        circles.style("filter", (d: KnowledgeNode) => d.id === selectedNodeId ? "url(#glow)" : null)
               .classed('pulse-animation', (d: KnowledgeNode) => d.id === selectedNodeId);

        circles.transition().duration(200)
            .attr("r", (d: KnowledgeNode) => d.id === selectedNodeId ? 14 : 12)
            .attr("stroke-width", (d: KnowledgeNode) => d.id === selectedNodeId ? 3 : 0)
            .attr("stroke", (d: KnowledgeNode) => d.id === selectedNodeId ? "#111827" : DisciplineColors[d.discipline] || "#6b7280");

        labels.transition().duration(200)
           .attr("font-size", (d: KnowledgeNode) => d.id === selectedNodeId ? "14px" : "12px")
           .attr("font-weight", (d: KnowledgeNode) => d.id === selectedNodeId ? "700" : "500");
           
        // Dim or highlight links
        link.transition().duration(200)
            .attr("stroke-width", (l: any) => {
                if (!isAnyNodeSelected) return 2;
                const sourceId = l.source.id || l.source;
                const targetId = l.target.id || l.target;
                return connectedToSelected.has(sourceId) && connectedToSelected.has(targetId) ? 2.5 : 1;
            })
            .attr("stroke-opacity", (l: any) => {
              if (!isAnyNodeSelected) return 0.6;
              const sourceId = l.source.id || l.source;
              const targetId = l.target.id || l.target;
              return connectedToSelected.has(sourceId) && connectedToSelected.has(targetId) ? 0.9 : 0.3;
            })
            .attr("stroke", (l: any) => {
                if (!isAnyNodeSelected) return "#9ca3af";
                const sourceId = l.source.id || l.source;
                const targetId = l.target.id || l.target;
                return connectedToSelected.has(sourceId) && connectedToSelected.has(targetId) ? "#1e3a8a" : "#9ca3af";
            })
            .attr("marker-end", (l: any) => {
                if (!isAnyNodeSelected) return "url(#arrowhead-default)";
                const sourceId = l.source.id || l.source;
                const targetId = l.target.id || l.target;
                return connectedToSelected.has(sourceId) && connectedToSelected.has(targetId) ? "url(#arrowhead-highlight)" : "url(#arrowhead-default)";
            });
    }

    // --- Interaction Logic ---
    svg.on('click', (event: MouseEvent) => {
        if (event.defaultPrevented) return;
        onClearSelection();
    });

    node.on("click", (event: any, d: KnowledgeNode) => {
        event.stopPropagation();
        onNodeClick(d);
      })
      .on("mouseover", (event: any, d: KnowledgeNode) => {
        tooltip.transition().duration(200).style("opacity", 0.95);
        tooltip.html(`<strong>${d.label}</strong><br/><span style="font-weight: 500; color: ${DisciplineColors[d.discipline] || '#6b7280'}">${d.discipline}</span>`);
      })
      .on("mousemove", (event: any) => {
        const [x, y] = d3.pointer(event, containerRef.current);
        tooltip.style("left", `${x + 15}px`).style("top", `${y + 10}px`);
      })
      .on("mouseout", () => {
        tooltip.transition().duration(300).style("opacity", 0);
        updateHighlight(); // Restore selection-based highlight on mouseout
      });

    const handleResize = () => {
        if (!containerRef.current || !svgRef.current) return;
        const width = containerRef.current.clientWidth;
        const height = containerRef.current.clientHeight;
        d3.select(svgRef.current).attr("width", width).attr("height", height);
        simulation.force("center", d3.forceCenter(width / 2, height / 2));
        simulation.alpha(0.3).restart();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);
    
    // --- Update simulation and apply states ---
    simulation.nodes(nodes).on("tick", ticked);
    simulation.force("link").links(links);
    
    handleResize();
    updateHighlight();

    // --- New robust zoom logic ---
    const simulationNodes = simulation.nodes();
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    if (selectedNodeId) {
        const selectedNodeData = simulationNodes.find((n: any) => n.id === selectedNodeId);
        if (selectedNodeData && typeof selectedNodeData.x === 'number') {
            const transform = d3.zoomIdentity
                .translate(width / 2, height / 2)
                .scale(1.5) // Apply a consistent, moderate zoom
                .translate(-selectedNodeData.x, -selectedNodeData.y);

            svg.transition()
                .duration(750)
                .call(zoom.transform, transform);
        }
    } else {
        // If no node is selected, reset the view.
        svg.transition()
            .duration(750)
            .call(zoom.transform, d3.zoomIdentity);
    }
    
    return () => {
      svg.on('click', null);
      resizeObserver.disconnect();
    };

  }, [data, onNodeClick, selectedNodeId, onClearSelection]);
  
  return (
    <div className={isMapFullscreen
        ? "fixed inset-0 bg-black/70 z-40 p-4 sm:p-8 animate-fade-in flex items-center justify-center"
        : "w-full h-full relative"
    }>
        <div ref={containerRef} className="w-full h-full bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden relative">
            <svg ref={svgRef}></svg>
            <div id="d3-tooltip" className="absolute opacity-0 pointer-events-none bg-gray-800/90 text-white text-xs rounded-md px-2 py-1 shadow-lg transition-opacity duration-200 z-10" style={{ backdropFilter: 'blur(2px)' }}></div>
            
            <div className="absolute top-4 right-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg p-3 max-w-xs text-left">
                <h4 className="text-sm font-bold text-gray-800 mb-2">Discipline Key</h4>
                <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                    {Object.entries(DisciplineColors).map(([discipline, color]) => (
                        <div key={discipline} className="flex items-center">
                            <span className="w-3 h-3 rounded-full mr-2 flex-shrink-0" style={{ backgroundColor: color }}></span>
                            <span className="text-xs text-gray-700 capitalize">{discipline.toLowerCase()}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="absolute bottom-4 right-4 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-lg shadow-lg flex flex-col overflow-hidden">
                {selectedNodeId && (
                    <>
                        <button onClick={onClearSelection} title="Clear Selection" aria-label="Clear Selection" className="p-2 text-gray-600 hover:bg-gray-100 hover:text-red-500 focus:outline-none focus:ring-2 focus:ring-brand-blue-light transition">
                            <svg className="w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                            </svg>
                        </button>
                        <div className="border-t border-gray-200"></div>
                    </>
                )}
                <button onClick={handleZoomIn} title="Zoom In" aria-label="Zoom In" className="p-2 text-gray-600 hover:bg-gray-100 hover:text-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue-light transition">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3h-6"></path></svg>
                </button>
                <div className="border-t border-gray-200"></div>
                <button onClick={handleZoomOut} title="Zoom Out" aria-label="Zoom Out" className="p-2 text-gray-600 hover:bg-gray-100 hover:text-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue-light transition">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7"></path></svg>
                </button>
                <div className="border-t border-gray-200"></div>
                <button onClick={handleResetZoom} title="Reset Zoom" aria-label="Reset Zoom" className="p-2 text-gray-600 hover:bg-gray-100 hover:text-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue-light transition">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h5M20 20v-5h-5M4 20h5v-5M20 4h-5v5"></path></svg>
                </button>
                <div className="border-t border-gray-200"></div>
                <button onClick={() => setIsMapFullscreen(!isMapFullscreen)} title={isMapFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} aria-label={isMapFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} className="p-2 text-gray-600 hover:bg-gray-100 hover:text-brand-blue focus:outline-none focus:ring-2 focus:ring-brand-blue-light transition">
                    {isMapFullscreen ? (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 3h6v6m-2-2L13 9M9 21H3v-6m2 2l6-6"></path></svg>
                    ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4h4m12 4V4h-4M4 16v4h4m12 0v-4h-4"></path></svg>
                    )}
                </button>
            </div>
        </div>
        {selectedNodeInfo && (
          <ConceptCard 
            nodeInfo={selectedNodeInfo} 
            onClose={onClearSelection}
          />
        )}
    </div>
  );
};