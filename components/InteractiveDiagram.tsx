import React, { useEffect, useRef, useId, useState } from 'react';
import type { DiagramData, DiagramNode as DiagramNodeType, DiagramLink as DiagramLinkType } from '../types';

declare const d3: any;

interface InteractiveDiagramProps {
  data: DiagramData;
}

// Helper to check if an element is a node or a link
const isNode = (el: any): el is DiagramNodeType => el && el.hasOwnProperty('id') && !el.hasOwnProperty('source');

export const InteractiveDiagram: React.FC<InteractiveDiagramProps> = ({ data }) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const componentId = useId();
  const [selectedElement, setSelectedElement] = useState<DiagramNodeType | DiagramLinkType | null>(null);
  
  const simulationRef = useRef<any>(null);
  const zoomRef = useRef<any>(null);

  useEffect(() => {
    if (!data || !svgRef.current || !containerRef.current) return;

    const { nodes, links } = data;
    if (!nodes || nodes.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;
    svg.attr("viewBox", [-width / 2, -height / 2, width, height]);

    const tooltipId = `diagram-tooltip-${componentId}`;
    if (d3.select(`#${tooltipId}`).empty()) {
        d3.select(containerRef.current)
          .append("div")
          .attr("id", tooltipId)
          .attr("class", "absolute opacity-0 pointer-events-none bg-gray-800/90 text-white text-xs rounded-md px-2 py-1 shadow-lg transition-opacity duration-200 z-10")
          .style("backdrop-filter", "blur(2px)");
    }
    const tooltip = d3.select(`#${tooltipId}`);

    const g = svg.append("g");

    const adjacency = new Map<string, Set<string>>(nodes.map(node => [node.id, new Set()]));
    links.forEach(link => {
        const sourceId = typeof link.source === 'object' ? (link.source as any).id : link.source;
        const targetId = typeof link.target === 'object' ? (link.target as any).id : link.target;
        if (adjacency.has(sourceId)) adjacency.get(sourceId)!.add(targetId);
        if (adjacency.has(targetId)) adjacency.get(targetId)!.add(sourceId);
    });

    if (!simulationRef.current) {
        simulationRef.current = d3.forceSimulation()
            .force("link", d3.forceLink().id((d: any) => d.id).distance(120))
            .force("charge", d3.forceManyBody().strength(-250))
            .force("center", d3.forceCenter(0, 0));
    }
    const simulation = simulationRef.current;
    simulation.nodes(nodes);
    simulation.force("link").links(links);

    if (!zoomRef.current) {
        zoomRef.current = d3.zoom()
            .scaleExtent([0.3, 3])
            .on("zoom", (event: any) => {
                g.attr("transform", event.transform);
            });
        svg.call(zoomRef.current);
    }
    const zoom = zoomRef.current;


    const link = g.append("g")
      .selectAll("path")
      .data(links)
      .join("path")
      .attr("stroke", "#6b7280")
      .attr("stroke-opacity", 0.8)
      .attr("stroke-width", 1.5)
      .attr('id', (d, i) => `link-path-${componentId}-${i}`);
      
    const linkLabelGroups = g.append("g")
      .selectAll("text")
      .data(links)
      .join("text")
      .attr('dy', -4);

    linkLabelGroups.append('textPath')
      .attr('href', (d, i) => `#link-path-${componentId}-${i}`)
      .style('text-anchor', 'middle')
      .attr('startOffset', '50%')
      .text((d: DiagramLinkType) => d.label)
      .attr("font-size", "9px")
      .attr("fill", "#4b5563");

    const node = g.append("g")
      .selectAll("g")
      .data(nodes)
      .join("g")
      .call(drag(simulation));

    node.append("rect")
      .attr("rx", 6)
      .attr("ry", 6)
      .attr("fill", "#e5e7eb")
      .attr("stroke", "#9ca3af")
      .attr("stroke-width", 1);


    node.append("text")
      .text((d: DiagramNodeType) => d.label)
      .attr("font-size", "11px")
      .attr("fill", "#1f2937")
      .attr("font-weight", "500")
      .attr("text-anchor", "middle")
      .attr("dominant-baseline", "central")
      .style('pointer-events', 'none');

    node.each(function(this: any) {
        const textElem = d3.select(this).select('text').node();
        if (textElem) {
            const { width, height } = textElem.getBBox();
            d3.select(this).select('rect')
                .attr('width', width + 20)
                .attr('height', height + 10)
                .attr('x', -(width + 20) / 2)
                .attr('y', -(height + 10) / 2);
        }
    });

    // --- Highlighting Logic based on selectedElement state ---
    let highlightedNodeIds = new Set<string>();
    let highlightedLinks = new Set<DiagramLinkType>();
    const isAnythingSelected = !!selectedElement;

    if (isAnythingSelected) {
        if (isNode(selectedElement)) {
            highlightedNodeIds.add(selectedElement.id);
            (adjacency.get(selectedElement.id) || new Set()).forEach(neighborId => highlightedNodeIds.add(neighborId as string));
            links.forEach(l => {
                const sourceId = typeof l.source === 'object' ? (l.source as any).id : l.source;
                const targetId = typeof l.target === 'object' ? (l.target as any).id : l.target;
                if (sourceId === selectedElement.id || targetId === selectedElement.id) highlightedLinks.add(l);
            });
        } else { // It's a link
            const sourceId = typeof selectedElement.source === 'object' ? (selectedElement.source as any).id : selectedElement.source;
            const targetId = typeof selectedElement.target === 'object' ? (selectedElement.target as any).id : selectedElement.target;
            highlightedNodeIds.add(sourceId);
            highlightedNodeIds.add(targetId);
            highlightedLinks.add(selectedElement);
        }
    }
    
    const applySelectionStyles = () => {
        node.transition().duration(200)
            .style("opacity", d => !isAnythingSelected || highlightedNodeIds.has(d.id) ? 1.0 : 0.3);
        node.select('rect').transition().duration(200)
            .attr("stroke-width", d => isAnythingSelected && highlightedNodeIds.has(d.id) ? 2 : 1)
            .attr("stroke", d => isAnythingSelected && highlightedNodeIds.has(d.id) ? '#374151' : '#9ca3af');

        link.transition().duration(200)
            .style("stroke-opacity", d => !isAnythingSelected || highlightedLinks.has(d) ? 0.8 : 0.2);
        linkLabelGroups.transition().duration(200)
            .style("opacity", d => !isAnythingSelected || highlightedLinks.has(d) ? 1.0 : 0.2);
    };
    
    applySelectionStyles();
    
    // --- Interaction Handlers ---
    svg.on('click', (event: MouseEvent) => {
      if (event.defaultPrevented) return; // Ignore clicks that are part of a zoom/drag gesture
      setSelectedElement(null)
    });

    node
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d: DiagramNodeType) => {
        event.stopPropagation();
        setSelectedElement(current => (current && isNode(current) && current.id === d.id) ? null : d);
      });

    const linkAndLabelSelection = link.merge(linkLabelGroups);
    linkAndLabelSelection
      .style('cursor', 'pointer')
      .on('click', (event: MouseEvent, d: DiagramLinkType) => {
        event.stopPropagation();
        setSelectedElement(current => (current === d) ? null : d);
      });
      
    node
      .on("mouseover", (event: any, d: DiagramNodeType) => {
        if (d.description) {
            tooltip.transition().duration(200).style("opacity", 0.95);
            tooltip.html(`<strong>${d.label}</strong>: ${d.description}`);
        }
        const connectedNodesIds = adjacency.get(d.id) || new Set<string>();
        connectedNodesIds.add(d.id);
        
        node.style("opacity", (o: DiagramNodeType) => connectedNodesIds.has(o.id) ? 1.0 : 0.3);
        d3.select(event.currentTarget).select('rect').attr('fill', '#d1d5db');
        link.style("stroke-opacity", (l: any) => (l.source.id === d.id || l.target.id === d.id) ? 1.0 : 0.2);
        linkLabelGroups.style("opacity", (l: any) => (l.source.id === d.id || l.target.id === d.id) ? 1.0 : 0.2);
      })
      .on("mousemove", (event: any) => {
        const [x, y] = d3.pointer(event, containerRef.current);
        tooltip.style("left", `${x + 15}px`).style("top", `${y + 10}px`);
      })
      .on("mouseout", () => {
        tooltip.transition().duration(300).style("opacity", 0);
        node.selectAll('rect').attr('fill', '#e5e7eb');
        applySelectionStyles();
      });

    simulation.on("tick", () => {
      link.attr("d", (d: any) => `M${d.source.x},${d.source.y} L${d.target.x},${d.target.y}`);
      node.attr("transform", (d: any) => `translate(${d.x},${d.y})`);
    });

    // --- Zoom Logic ---
    if (isAnythingSelected && highlightedNodeIds.size > 0) {
        const coords = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };
        node.each(function(d: any) {
            if (highlightedNodeIds.has(d.id)) {
                coords.x1 = Math.min(coords.x1, d.x);
                coords.y1 = Math.min(coords.y1, d.y);
                coords.x2 = Math.max(coords.x2, d.x);
                coords.y2 = Math.max(coords.y2, d.y);
            }
        });
        const boxWidth = coords.x2 - coords.x1;
        const boxHeight = coords.y2 - coords.y1;
        if (isFinite(boxWidth) && isFinite(boxHeight) && (boxWidth > 0 || boxHeight > 0)) {
            const scale = Math.min(width / (boxWidth + 150), height / (boxHeight + 150), 1.5);
            const midX = (coords.x1 + coords.x2) / 2;
            const midY = (coords.y1 + coords.y2) / 2;
            const transform = d3.zoomIdentity.translate(-midX * scale, -midY * scale).scale(scale);
            svg.transition().duration(750).call(zoom.transform, transform);
        }
    } else {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
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
    
    const handleResize = () => {
      if (!containerRef.current) return;
      const newWidth = containerRef.current.clientWidth;
      const newHeight = containerRef.current.clientHeight;
      svg.attr("viewBox", [-newWidth / 2, -newHeight / 2, newWidth, newHeight]);
      simulation.alpha(0.3).restart();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    simulation.alpha(1).restart();

    return () => {
        resizeObserver.disconnect();
        simulation.stop();
        d3.select(`#${tooltipId}`).remove();
    };
  }, [data, componentId, selectedElement]);

  return (
    <div ref={containerRef} className="w-full h-72 bg-white border border-gray-200 rounded-md overflow-hidden relative mt-2">
      <svg ref={svgRef} className="w-full h-full"></svg>
    </div>
  );
};
