import React, { useEffect, useRef, useId, useState, useCallback } from 'react';
import type { DiagramData, DiagramNode as DiagramNodeType, DiagramLink as DiagramLinkType } from '../types';

declare const d3: any;

interface InteractiveDiagramProps {
  data: DiagramData;
}

const isNode = (el: any): el is DiagramNodeType => el && el.hasOwnProperty('id') && !el.hasOwnProperty('source');

export const InteractiveDiagram: React.FC<InteractiveDiagramProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const componentId = useId();
  const [selectedElement, setSelectedElement] = useState<DiagramNodeType | DiagramLinkType | null>(null);
  const [isDiagramFullscreen, setIsDiagramFullscreen] = useState(false);
  
  const simulationRef = useRef<any>();
  const zoomRef = useRef<any>();
  const elementsRef = useRef<{ g?: any, node?: any, link?: any, linkPath?: any }>({});
  
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

      const width = parent.clientWidth;
      const height = parent.clientHeight;
      
      const bounds = g.node().getBBox();
      if (bounds.width === 0 || bounds.height === 0) return; // Avoid division by zero
      
      const scale = Math.min(0.9, 0.9 / Math.max(bounds.width / width, bounds.height / height));
      const translate = [
          width / 2 - scale * (bounds.x + bounds.width / 2),
          height / 2 - scale * (bounds.y + bounds.height / 2)
      ];

      const transform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);

      svg.transition().duration(750).call(zoomRef.current.transform, transform);
    }
  }, []);

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;
    
    const { nodes, links } = data;
    if (!nodes || nodes.length === 0) return;

    const { width, height } = containerRef.current.getBoundingClientRect();
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append('defs');
    defs.html(`
      <marker id="arrow-diagram-${componentId}" viewBox="0 -5 10 10" refX="10" refY="0" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#4b5563"></path>
      </marker>
    `);
    
    simulationRef.current = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(120).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-400))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius((d: any) => (d.width || 60) / 2 + 10));
    
    const g = svg.append("g");
    elementsRef.current.g = g;

    const link = g.append("g").selectAll("g").data(links).join("g");
    const linkPath = link.append("path")
      .attr("fill", "none")
      .attr("stroke-width", 1.5)
      .attr("stroke", "#9ca3af")
      .attr("marker-end", `url(#arrow-diagram-${componentId})`);
    
    link.append("text")
      .text((d: any) => d.label)
      .attr("dy", "-5")
      .attr("text-anchor", "middle")
      .attr("font-size", "9px")
      .attr("fill", "#4b5563");
    
    elementsRef.current.link = link;
    elementsRef.current.linkPath = linkPath;
    
    const node = g.append("g").selectAll("g")
      .data(nodes)
      .join("g")
      .attr("cursor", "grab")
      .on("click", (event: any, d: any) => {
          event.stopPropagation();
          setSelectedElement(d);
      });
      
    node.append("rect")
      .attr("rx", 5).attr("ry", 5)
      .attr("stroke", "#9ca3af").attr("stroke-width", 1.5)
      .attr("fill", (d: any) => isNode(selectedElement) && d.id === selectedElement.id ? "#dbeafe" : "#f3f4f6");

    node.append("text")
      .text((d: any) => d.label)
      .attr("text-anchor", "middle").attr("dy", ".3em")
      .attr("font-size", "10px").attr("font-weight", "500").attr("fill", "#111827");

    node.each(function(d: any) {
        const textNode = d3.select(this).select('text').node();
        if (textNode) {
            const bbox = textNode.getBBox();
            d.width = bbox.width + 20;
            d.height = bbox.height + 12;
            d3.select(this).select('rect')
                .attr("width", d.width)
                .attr("height", d.height)
                .attr("x", -d.width / 2)
                .attr("y", -d.height / 2);
        }
    });
    
    elementsRef.current.node = node;

    const drag = d3.drag()
        .on("start", (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; d3.select(event.sourceEvent.target).attr('cursor', 'grabbing'); })
        .on("drag", (event: any, d: any) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0); d.fx = null; d.fy = null; d3.select(event.sourceEvent.target).attr('cursor', 'grab'); });
    node.call(drag);
    
    zoomRef.current = d3.zoom().scaleExtent([0.2, 3]).on("zoom", (event: any) => g.attr("transform", event.transform));
    svg.call(zoomRef.current);
    svg.on("click", () => setSelectedElement(null));
    
    // Use a timeout to ensure the DOM has updated before calculating zoom, especially for fullscreen.
    const timer = setTimeout(() => handleResetZoom(), 100);

    function intersectRect(rect: any, point: any) {
        const cx = rect.x;
        const cy = rect.y;
        const dx = point.x - cx;
        const dy = point.y - cy;
        const w = (rect.width || 0) / 2;
        const h = (rect.height || 0) / 2;
        if (w === 0 || h === 0) return { x: cx, y: cy }; // Prevent division by zero if node size not yet calculated
        const m = dy / dx;
        const rectDiagSlope = h / w;
        let x, y;

        if (Math.abs(m) < rectDiagSlope) {
            const sign = (dx > 0) ? 1 : -1;
            x = cx + sign * w;
            y = cy + sign * w * m;
        } else {
            const sign = (dy > 0) ? 1 : -1;
            x = cx + sign * h / m;
            y = cy + sign * h;
        }
        return { x, y };
    }

    simulationRef.current.on("tick", () => {
        node.attr("transform", (d: any) => `translate(${d.x || 0},${d.y || 0})`);
        
        linkPath.attr('d', (d: any) => {
            if (!d.source.x || !d.target.x) return null;
            const sourcePoint = intersectRect(d.source, d.target);
            const targetPoint = intersectRect(d.target, d.source);
            return `M ${sourcePoint.x} ${sourcePoint.y} L ${targetPoint.x} ${targetPoint.y}`;
        });

        link.select('text').attr("transform", (d: any) => `translate(${(d.source.x + d.target.x) / 2},${(d.source.y + d.target.y) / 2})`);
    });

    return () => { 
        clearTimeout(timer);
        simulationRef.current.stop(); 
    };
  }, [data, componentId, isDiagramFullscreen, handleResetZoom]);

  useEffect(() => {
    const { node } = elementsRef.current;
    if (!node) return;

    const selectedId = selectedElement && isNode(selectedElement) ? selectedElement.id : null;
    
    node.select('rect')
      .transition().duration(200)
      .attr('fill', (d: any) => d.id === selectedId ? '#dbeafe' : '#f3f4f6')
      .attr('stroke', (d: any) => d.id === selectedId ? '#3b82f6' : '#9ca3af');
      
  }, [selectedElement]);

  const InfoCard: React.FC = () => {
    if (!selectedElement) return null;
    return (
      <div className="absolute top-2 left-2 right-2 sm:right-auto sm:w-64 bg-white/80 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-3 text-xs z-10 animate-fade-in">
        <p className="font-bold text-gray-800">{selectedElement.label}</p>
        {isNode(selectedElement) && selectedElement.description && <p className="text-gray-600 mt-1">{selectedElement.description}</p>}
      </div>
    );
  };
  
  return (
    <div ref={containerRef} className={`relative w-full h-full bg-white ${isDiagramFullscreen ? 'fixed inset-0 z-40' : ''}`}>
      <svg ref={svgRef} className="w-full h-full"></svg>
      <div className="absolute bottom-2 right-2 flex flex-col gap-2 z-10 transition-opacity duration-300">
            <button onClick={() => handleZoomIn()} title="Zoom In" className="bg-white/80 hover:bg-white p-2 rounded-lg shadow-md border"><svg className="h-4 w-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg></button>
            <button onClick={() => handleZoomOut()} title="Zoom Out" className="bg-white/80 hover:bg-white p-2 rounded-lg shadow-md border"><svg className="h-4 w-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg></button>
            <button onClick={() => handleResetZoom()} title="Reset View" className="bg-white/80 hover:bg-white p-2 rounded-lg shadow-md border"><svg className="h-4 w-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 10a5 5 0 1110 0 5 5 0 01-10 0zM2.455 6.09A8.023 8.023 0 014.28 4.282a8.023 8.023 0 013.801-1.825 1 1 0 01.91 1.838A6.023 6.023 0 005.16 8.55a1 1 0 11-1.84 1.01A8.003 8.003 0 012.455 6.09zM15.72 15.718a8.023 8.023 0 01-3.801 1.825 1 1 0 01-.91-1.838 6.023 6.023 0 003.11-2.47 1 1 0 111.84-1.01 8.003 8.003 0 01-2.695 3.504z" clipRule="evenodd" /></svg></button>
            <button onClick={() => setIsDiagramFullscreen(f => !f)} title={isDiagramFullscreen ? "Exit Fullscreen" : "Enter Fullscreen"} className="bg-white/80 hover:bg-white p-2 rounded-lg shadow-md border">
              {isDiagramFullscreen ? <svg className="h-4 w-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg> : <svg className="h-4 w-4 text-gray-700" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 8a1 1 0 011-1h4a1 1 0 110 2H5v3a1 1 0 11-2 0V8zm14 4a1 1 0 01-1 1h-4a1 1 0 110-2h3V8a1 1 0 112 0v4z" clipRule="evenodd" /></svg>}
            </button>
      </div>
      <InfoCard />
    </div>
  );
};
