
import React, { useEffect, useRef, useId, useState, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { DiagramData, DiagramNode as DiagramNodeType, DiagramLink as DiagramLinkType } from '../types';

declare const d3: any;

interface InteractiveDiagramProps {
  data: DiagramData;
  id?: string;
}

const isNode = (el: any): el is DiagramNodeType => el && el.hasOwnProperty('id') && !el.hasOwnProperty('source');

export const InteractiveDiagram: React.FC<InteractiveDiagramProps> = ({ data, id }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const componentId = useId();
  const [selectedElement, setSelectedElement] = useState<DiagramNodeType | DiagramLinkType | null>(null);
  const [isDiagramFullscreen, setIsDiagramFullscreen] = useState(false);

  const simulationRef = useRef<any>(null);
  const zoomRef = useRef<any>(null);
  const gRef = useRef<any>(null);

  const simulationDataRef = useRef<{ nodes: any[], links: any[] } | null>(null);
  const dataString = useMemo(() => JSON.stringify(data), [data]);

  useMemo(() => {
      simulationDataRef.current = {
        nodes: data.nodes.map(n => ({ ...n })),
        links: data.links.map(l => ({ ...l }))
    };
  }, [dataString]);

  const handleResetZoom = useCallback(() => {
    if (!svgRef.current || !gRef.current || !containerRef.current || !zoomRef.current) return;
    const svg = d3.select(svgRef.current);
    const g = gRef.current;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width === 0 || height === 0) return;
    const bounds = g.node().getBBox();
    if (bounds.width === 0 || bounds.height === 0) return;
    const scale = Math.min(1.2, 0.9 / Math.max(bounds.width / width, bounds.height / height));
    const translate = [
        width / 2 - scale * (bounds.x + bounds.width / 2),
        height / 2 - scale * (bounds.y + bounds.height / 2)
    ];
    const transform = d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale);
    svg.transition().duration(750).call(zoomRef.current.transform, transform);
  }, []);

  const initDiagram = useCallback(() => {
    if (!simulationDataRef.current || !svgRef.current || !containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    if (width === 0 || height === 0) return; // Wait for layout

    const { nodes, links } = simulationDataRef.current;
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const defs = svg.append('defs');
    defs.html(`
      <marker id="arrow-diagram-${componentId}" viewBox="0 -5 10 10" refX="20" refY="0" markerWidth="8" markerHeight="8" orient="auto">
        <path d="M0,-5L10,0L0,5" fill="#9ca3af"></path>
      </marker>
    `);

    const filter = defs.append("filter").attr("id", `drop-shadow-${componentId}`).attr("height", "150%");
    filter.append("feGaussianBlur").attr("in", "SourceAlpha").attr("stdDeviation", 3).attr("result", "blur");
    filter.append("feOffset").attr("in", "blur").attr("dx", 3).attr("dy", 3).attr("result", "offsetBlur");
    const feMerge = filter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "offsetBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");
    
    simulationRef.current = d3.forceSimulation(nodes)
      .force("link", d3.forceLink(links).id((d: any) => d.id).distance(200).strength(0.5))
      .force("charge", d3.forceManyBody().strength(-2000))
      .force("center", d3.forceCenter(width / 2, height / 2))
      .force("collision", d3.forceCollide().radius(100).iterations(2));
    
    const g = svg.append("g");
    gRef.current = g;

    const linkGroup = g.append("g").attr("class", "links").selectAll("g").data(links).join("g");
    const linkPath = linkGroup.append("path").attr("fill", "none").attr("stroke-width", 1.5).attr("stroke", "#9ca3af").attr("marker-end", `url(#arrow-diagram-${componentId})`);
    const linkLabelGroup = g.append("g").attr("class", "link-labels").selectAll("g").data(links).join("g");
    linkLabelGroup.append("rect").attr("rx", 12).attr("ry", 12).attr("fill", "white").attr("fill-opacity", 0.9).attr("stroke", "#e5e7eb").attr("stroke-width", 1);
    linkLabelGroup.append("text").text((d: any) => d.label).attr("text-anchor", "middle").attr("dy", "0.35em").attr("font-size", "16px").attr("fill", "#4b5563").attr("font-family", "sans-serif")
      .each(function(d: any) { const bbox = (this as any).getBBox(); d.width = bbox.width + 16; d.height = bbox.height + 10; });
    linkLabelGroup.select("rect").attr("width", (d: any) => d.width).attr("height", (d: any) => d.height).attr("x", (d: any) => -d.width / 2).attr("y", (d: any) => -d.height / 2);
    
    const nodeGroup = g.append("g").attr("class", "nodes").selectAll("g").data(nodes).join("g").attr("cursor", "grab")
      .on("click", (event: any, d: any) => { event.stopPropagation(); setSelectedElement(d); })
      .call(d3.drag().on("start", (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; }).on("drag", (event: any, d: any) => { d.fx = event.x; d.fy = event.y; }).on("end", (event: any, d: any) => { if (!event.active) simulationRef.current.alphaTarget(0); d.fx = null; d.fy = null; }));
    nodeGroup.append("rect").attr("rx", 8).attr("ry", 8).attr("stroke", "#e5e7eb").attr("stroke-width", 1).attr("fill", "#ffffff").style("filter", `url(#drop-shadow-${componentId})`);
    nodeGroup.append("text").text((d: any) => d.label).attr("text-anchor", "middle").attr("dy", ".35em").attr("font-size", "18px").attr("font-weight", "600").attr("fill", "#1f2937")
      .each(function(d: any) { const bbox = (this as any).getBBox(); d.width = bbox.width + 30; d.height = bbox.height + 20; });
    nodeGroup.select("rect").attr("width", (d: any) => d.width).attr("height", (d: any) => d.height).attr("x", (d: any) => -d.width / 2).attr("y", (d: any) => -d.height / 2);

    simulationRef.current.force("collision").radius((d: any) => (d.width || 100) / 2 + 15);
    simulationRef.current.alpha(1).restart();
    zoomRef.current = d3.zoom().scaleExtent([0.2, 4]).on("zoom", (event: any) => g.attr("transform", event.transform));
    svg.call(zoomRef.current);
    svg.on("click", () => setSelectedElement(null));
    
    function intersectRect(rect: any, point: any) {
        const cx = rect.x; const cy = rect.y; const dx = point.x - cx; const dy = point.y - cy;
        const w = (rect.width || 0) / 2; const h = (rect.height || 0) / 2;
        if (w === 0 || h === 0) return { x: cx, y: cy }; 
        if (Math.abs(dy * w) < Math.abs(dx * h)) {
            if (dx > 0) return { x: cx + w, y: cy + dy * w / dx };
            else return { x: cx - w, y: cy - dy * w / dx };
        } else {
            if (dy > 0) return { x: cx + dx * h / dy, y: cy + h };
            else return { x: cx - dx * h / dy, y: cy - h };
        }
    }

    simulationRef.current.on("tick", () => {
        nodeGroup.attr("transform", (d: any) => `translate(${d.x || 0},${d.y || 0})`);
        linkPath.attr('d', (d: any) => {
            if (!d.source.x || !d.target.x) return null;
            const sourcePoint = intersectRect(d.source, d.target);
            const targetPoint = intersectRect(d.target, d.source);
            return `M ${sourcePoint.x} ${sourcePoint.y} L ${targetPoint.x} ${targetPoint.y}`;
        });
        linkLabelGroup.attr("transform", (d: any) => {
            if (!d.source.x || !d.target.x) return null;
            const midX = (d.source.x + d.target.x) / 2; const midY = (d.source.y + d.target.y) / 2;
            const dx = d.target.x - d.source.x; const dy = d.target.y - d.source.y;
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle > 90 || angle < -90) angle += 180;
            return `translate(${midX},${midY}) rotate(${angle})`;
        });
    });
    
    setTimeout(handleResetZoom, 300);
  }, [componentId, handleResetZoom]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
        window.requestAnimationFrame(() => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                if (width > 0 && height > 0) initDiagram();
            }
        });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [initDiagram, dataString, isDiagramFullscreen]);

  const ControlButton: React.FC<{ onClick: () => void, title: string, children: React.ReactNode }> = ({ onClick, title, children }) => (
    <button onClick={onClick} title={title} className="bg-white/90 hover:bg-white p-2 rounded-lg shadow-md border border-gray-200 text-gray-700 hover:text-brand-blue transition">
      {children}
    </button>
  );
  
  const renderDiagramContent = (fullscreen: boolean) => (
    <div ref={containerRef} id={id} className={`bg-white ${fullscreen ? 'fixed inset-0 z-[9999] w-screen h-screen p-4 shadow-2xl' : 'relative w-full min-h-[300px] h-full rounded-lg'}`}>
      <svg ref={svgRef} className="w-full h-full" style={{ touchAction: 'none' }}></svg>
      <div className="absolute top-2 left-2 flex flex-col gap-2 z-10">
            <ControlButton onClick={() => d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 1.2)} title="Zoom In">
               <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
            </ControlButton>
            <ControlButton onClick={() => d3.select(svgRef.current).transition().call(zoomRef.current.scaleBy, 0.8)} title="Zoom Out">
               <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" /></svg>
            </ControlButton>
            <ControlButton onClick={handleResetZoom} title="Reset View">
               <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 10a5 5 0 1110 0 5 5 0 01-10 0zM2.455 6.09A8.023 8.023 0 014.28 4.282a8.023 8.023 0 013.801-1.825 1 1 0 01.91 1.838A6.023 6.023 0 005.16 8.55a1 1 0 11-1.84 1.01A8.003 8.003 0 012.455 6.09zM15.72 15.718a8.023 8.023 0 01-3.801 1.825 1 1 0 01-.91-1.838 6.023 6.023 0 003.11-2.47 1 1 0 111.84-1.01 8.003 8.003 0 01-2.695 3.504z" clipRule="evenodd" /></svg>
            </ControlButton>
            <ControlButton onClick={() => setIsDiagramFullscreen(!fullscreen)} title={fullscreen ? "Exit Fullscreen (Esc)" : "Enter Fullscreen"}>
              {fullscreen ? <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg> : <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M3 8a1 1 0 011-1h4a1 1 0 110 2H5v3a1 1 0 11-2 0V8zm14 4a1 1 0 01-1 1h-4a1 1 0 110-2h3V8a1 1 0 112 0v4z" clipRule="evenodd" /></svg>}
            </ControlButton>
      </div>
      {selectedElement && (
        <div className="absolute top-2 right-12 sm:w-64 bg-white/90 backdrop-blur-sm rounded-lg shadow-lg border border-gray-200 p-3 text-xs z-20 animate-fade-in">
          <p className="font-bold text-gray-800">{selectedElement.label}</p>
          {isNode(selectedElement) && selectedElement.description && <p className="text-gray-600 mt-1">{selectedElement.description}</p>}
        </div>
      )}
    </div>
  );

  return isDiagramFullscreen ? createPortal(renderDiagramContent(true), document.body) : renderDiagramContent(false);
};
