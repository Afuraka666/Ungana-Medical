
import React, { useEffect, useRef, useCallback } from 'react';

declare const d3: any;

type GraphType = 'oxygen_dissociation' | 'frank_starling' | 'pressure_volume_loop' | 'cerebral_pressure_volume' | 'cerebral_autoregulation' | 'other';

interface ScientificGraphProps {
    type: GraphType;
    title: string;
    className?: string;
}

export const ScientificGraph: React.FC<ScientificGraphProps> = ({ type, title, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    
    const isSupportedType = ['oxygen_dissociation', 'frank_starling', 'pressure_volume_loop', 'cerebral_pressure_volume', 'cerebral_autoregulation'].includes(type);

    const renderGraph = useCallback(() => {
        if (!containerRef.current || !isSupportedType) return;
        
        const container = d3.select(containerRef.current);
        container.selectAll('*').remove();

        const rect = containerRef.current.getBoundingClientRect();
        if (rect.width === 0) return;

        const margin = { top: 60, right: 60, bottom: 60, left: 75 };
        const width = rect.width - margin.left - margin.right;
        const height = 400 - margin.top - margin.bottom;

        if (width <= 0 || height <= 0) return;

        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#f1f5f9' : '#0f172a';
        const gridColor = isDark ? '#334155' : '#cbd5e1';

        const svg = container.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .attr('class', 'overflow-visible font-sans')
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        const x = d3.scaleLinear().range([0, width]);
        const y = d3.scaleLinear().range([height, 0]);

        // Tooltip Marker Helper
        const addMarker = (xVal: number, yVal: number, color: string, infoTitle: string, infoDesc: string) => {
            const marker = svg.append('g')
                .attr('class', 'info-marker cursor-help transition-all')
                .attr('transform', `translate(${x(xVal)}, ${y(yVal)})`);

            marker.append('circle')
                .attr('r', 9)
                .attr('fill', color)
                .attr('stroke', '#fff')
                .attr('stroke-width', 2.5)
                .attr('filter', 'drop-shadow(0px 2px 4px rgba(0,0,0,0.2))');

            marker.append('text')
                .attr('text-anchor', 'middle')
                .attr('dy', '0.35em')
                .attr('fill', '#fff')
                .attr('font-size', '11px')
                .attr('font-weight', '900')
                .text('i');

            const tooltip = marker.append('g')
                .attr('class', 'marker-tooltip')
                .style('opacity', 0)
                .style('pointer-events', 'none');

            tooltip.append('rect')
                .attr('x', 15)
                .attr('y', -45)
                .attr('width', 200)
                .attr('height', 90)
                .attr('rx', 10)
                .attr('fill', isDark ? '#1e293b' : '#ffffff')
                .attr('stroke', color)
                .attr('stroke-width', 2)
                .style('filter', 'drop-shadow(0 10px 20px rgba(0,0,0,0.15))');

            const text = tooltip.append('text')
                .attr('x', 25)
                .attr('y', -25)
                .attr('font-size', '12px')
                .attr('fill', textColor);

            text.append('tspan')
                .attr('font-weight', 'black')
                .attr('fill', color)
                .attr('text-transform', 'uppercase')
                .attr('letter-spacing', '0.05em')
                .text(infoTitle);

            infoDesc.split('\n').forEach((line, i) => {
                text.append('tspan')
                    .attr('x', 25)
                    .attr('dy', i === 0 ? '1.5em' : '1.3em')
                    .attr('font-weight', 'medium')
                    .text(line);
            });

            marker.on('mouseenter', function() {
                d3.select(this).select('circle').transition().duration(200).attr('r', 11);
                tooltip.transition().duration(300).style('opacity', 1).attr('transform', 'translate(5, 0)');
            }).on('mouseleave', function() {
                d3.select(this).select('circle').transition().duration(200).attr('r', 9);
                tooltip.transition().duration(300).style('opacity', 0).attr('transform', 'translate(0, 0)');
            });
        };

        let activeData: any[] = [];
        let bisect = d3.bisector((d: any) => d.x).left;
        let xLabel = "";
        let yLabel = "";

        if (type === 'oxygen_dissociation') {
            const n = 2.8;
            const calcSaO2 = (p: number, p50: number) => (Math.pow(p, n) / (Math.pow(p, n) + Math.pow(p50, n))) * 100;
            const gen = (p50Val: number) => {
                const arr = [];
                for (let p = 0; p <= 110; p += 0.5) arr.push({ x: p, y: calcSaO2(p, p50Val) });
                return arr;
            };
            x.domain([0, 110]); y.domain([0, 105]);
            activeData = gen(26.6);
            xLabel = "Partial Pressure of Oxygen (PaO₂ / mmHg)"; yLabel = "Hemoglobin Saturation (SaO₂ / %)";
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            // Left shift
            svg.append('path').datum(gen(18.6)).attr('fill', 'none').attr('stroke', '#0ea5e9').attr('stroke-width', 2).attr('stroke-dasharray', '6,4').attr('d', line).attr('opacity', 0.4);
            // Right shift
            svg.append('path').datum(gen(34.6)).attr('fill', 'none').attr('stroke', '#f43f5e').attr('stroke-width', 2).attr('stroke-dasharray', '6,4').attr('d', line).attr('opacity', 0.4);
            // Normal
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', isDark ? '#3b82f6' : '#1e3a8a').attr('stroke-width', 4).attr('d', line);
            addMarker(15, 85, '#0ea5e9', 'Left Shift (Alkalosis)', 'Higher affinity for O₂.\nOccurs in hypothermia, alkalosis,\nand low 2,3-BPG.');
            addMarker(75, 65, '#f43f5e', 'Right Shift (Acidosis)', 'Lower affinity; easier unloading.\nOccurs in fever, acidosis,\nand high 2,3-BPG.');
        } else if (type === 'frank_starling') {
            x.domain([0, 200]); y.domain([0, 150]);
            xLabel = "Left Ventricular End-Diastolic Volume (mL)"; yLabel = "Stroke Volume (mL)";
            const gen = (k: number) => {
                const arr = [];
                for (let v = 0; v <= 200; v += 2) arr.push({ x: v, y: k * (1 - Math.exp(-0.02 * v)) * 100 });
                return arr;
            };
            activeData = gen(1.2);
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(gen(1.7)).attr('fill', 'none').attr('stroke', '#10b981').attr('stroke-width', 2).attr('stroke-dasharray', '4,2').attr('d', line).attr('opacity', 0.4);
            svg.append('path').datum(gen(0.6)).attr('fill', 'none').attr('stroke', '#f43f5e').attr('stroke-width', 2).attr('stroke-dasharray', '4,2').attr('d', line).attr('opacity', 0.4);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#3b82f6').attr('stroke-width', 4).attr('d', line);
            addMarker(40, 115, '#10b981', 'Hyperdynamic State', 'Enhanced contractility.\nSeen in sepsis (early phase)\nor inotropic support.');
            addMarker(155, 60, '#f43f5e', 'Hypodynamic (HF)', 'Reduced contractility.\nPreload increases (congestion)\nwithout proportional SV increase.');
        } else if (type === 'pressure_volume_loop') {
            x.domain([40, 165]); y.domain([0, 145]);
            xLabel = "LV Volume (mL)"; yLabel = "LV Pressure (mmHg)";
            activeData = [
                {x: 50, y: 10}, {x: 150, y: 12}, // Filling
                {x: 150, y: 80}, // Isovolumetric contraction
                {x: 110, y: 125}, {x: 50, y: 85}, // Ejection
                {x: 50, y: 10} // Isovolumetric relaxation
            ];
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveCatmullRomClosed.alpha(0.5));
            svg.append('path').datum(activeData).attr('fill', 'url(#loop-gradient)').attr('stroke', '#3b82f6').attr('stroke-width', 4).attr('d', line);
            
            const defs = svg.append('defs');
            const gradient = defs.append('linearGradient').attr('id', 'loop-gradient').attr('x1', '0%').attr('y1', '0%').attr('x2', '0%').attr('y2', '100%');
            gradient.append('stop').attr('offset', '0%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.2);
            gradient.append('stop').attr('offset', '100%').attr('stop-color', '#3b82f6').attr('stop-opacity', 0.05);

            addMarker(150, 46, '#94a3b8', 'Mitral Closure (EDV)', 'End of diastolic filling.\nCorrelates with Preload.');
            addMarker(50, 47, '#94a3b8', 'Aortic Closure (ESV)', 'End of systolic ejection.\nReflects Afterload.');
        } else if (type === 'cerebral_pressure_volume') {
            x.domain([0, 100]); y.domain([0, 100]);
            for (let v = 0; v <= 100; v += 1) activeData.push({ x: v, y: 4 * Math.exp(0.032 * v) });
            xLabel = "Intracranial Volume Addition"; yLabel = "ICP (mmHg)";
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#ef4444').attr('stroke-width', 4).attr('d', line);
            addMarker(25, 12, '#94a3b8', 'Spatial Compensation', 'Monro-Kellie Doctrine:\nCSF and venous blood displacement\nkeeps ICP normal initially.');
            addMarker(80, 58, '#dc2626', 'Decompensation', 'Exhausted buffering capacity.\nMinimal volume increase causes\ncatastrophic ICP spikes.');
        } else if (type === 'cerebral_autoregulation') {
            x.domain([0, 200]); y.domain([0, 100]);
            for (let map = 0; map <= 200; map += 2) {
                let cbf = 50;
                if (map < 50) cbf = map; 
                else if (map > 150) cbf = 50 + (map - 150) * 0.9;
                activeData.push({ x: map, y: cbf });
            }
            xLabel = "Mean Arterial Pressure (MAP / mmHg)"; yLabel = "Cerebral Blood Flow (CBF)";
            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);
            svg.append('path').datum(activeData).attr('fill', 'none').attr('stroke', '#10b981').attr('stroke-width', 4).attr('d', line);
            addMarker(100, 50, '#10b981', 'Autoregulatory Plateau', 'Stable CBF despite MAP changes.\nMaintained via vasoconstriction/\ndilation within 50-150 mmHg.');
        }

        // --- AXES & GRID ---
        svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(8).tickSize(-height).tickFormat('')).attr('stroke', gridColor).attr('stroke-opacity', 0.1);
        svg.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(8).tickSize(-width).tickFormat('')).attr('stroke', gridColor).attr('stroke-opacity', 0.1);
        
        const xAxis = svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(8));
        xAxis.selectAll('text').attr('fill', textColor).attr('font-size', '11px').attr('font-weight', '500');
        
        const yAxis = svg.append('g').call(d3.axisLeft(y).ticks(8));
        yAxis.selectAll('text').attr('fill', textColor).attr('font-size', '11px').attr('font-weight', '500');

        svg.append('text').attr('x', width/2).attr('y', height + 45).attr('text-anchor', 'middle').attr('fill', textColor).attr('font-weight', '800').attr('font-size', '13px').attr('text-transform', 'uppercase').attr('letter-spacing', '0.025em').text(xLabel);
        svg.append('text').attr('transform', 'rotate(-90)').attr('y', -60).attr('x', -height/2).attr('text-anchor', 'middle').attr('fill', textColor).attr('font-weight', '800').attr('font-size', '13px').attr('text-transform', 'uppercase').attr('letter-spacing', '0.025em').text(yLabel);
        svg.append('text').attr('x', width / 2).attr('y', -30).attr('text-anchor', 'middle').attr('font-weight', '900').attr('fill', textColor).attr('font-size', '18px').attr('letter-spacing', '-0.02em').text(title);

        // --- INTERACTIVE CROSSHAIR ---
        const focus = svg.append('g').style('display', 'none');
        focus.append('line').attr('class', 'x-hover-line').attr('y1', 0).attr('y2', height).attr('stroke', textColor).attr('stroke-width', 1).attr('stroke-dasharray', '4,4');
        focus.append('line').attr('class', 'y-hover-line').attr('x1', 0).attr('x2', width).attr('stroke', textColor).attr('stroke-width', 1).attr('stroke-dasharray', '4,4');
        focus.append('circle').attr('r', 7).attr('fill', '#1e3a8a').attr('stroke', '#fff').attr('stroke-width', 2);
        
        const tooltipGroup = focus.append('g').attr('class', 'value-tooltip');
        tooltipGroup.append('rect').attr('width', 110).attr('height', 50).attr('rx', 8).attr('fill', isDark ? '#0f172a' : '#ffffff').attr('stroke', isDark ? '#334155' : '#e2e8f0').attr('stroke-width', 1.5).style('filter', 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))');
        const tooltipText = tooltipGroup.append('text').attr('x', 12).attr('y', 20).attr('font-size', '11px').attr('font-weight', 'bold').attr('fill', textColor);
        const tSpanX = tooltipText.append('tspan').attr('x', 12).attr('dy', '0em');
        const tSpanY = tooltipText.append('tspan').attr('x', 12).attr('dy', '1.5em');

        svg.append('rect')
            .attr('width', width)
            .attr('height', height)
            .attr('fill', 'none')
            .attr('pointer-events', 'all')
            .on('mouseover', () => focus.style('display', null))
            .on('mouseout', () => focus.style('display', 'none'))
            .on('mousemove', function(event: any) {
                const mouseX = d3.pointer(event)[0];
                const x0 = x.invert(mouseX);
                const i = bisect(activeData, x0, 1);
                if (!activeData[i] || !activeData[i-1]) return;
                const d0 = activeData[i - 1];
                const d1 = activeData[i];
                const d = x0 - d0.x > d1.x - x0 ? d1 : d0;

                focus.select('circle').attr('transform', `translate(${x(d.x)},${y(d.y)})`);
                focus.select('.x-hover-line').attr('transform', `translate(${x(d.x)},0)`);
                focus.select('.y-hover-line').attr('transform', `translate(0,${y(d.y)})`);
                
                tSpanX.text(`X: ${d.x.toFixed(1)}`);
                tSpanY.text(`Y: ${d.y.toFixed(1)}`);

                let tx = x(d.x) + 15;
                let ty = y(d.y) - 60;
                if (tx + 110 > width) tx = x(d.x) - 125;
                if (ty < -40) ty = y(d.y) + 15;
                tooltipGroup.attr('transform', `translate(${tx}, ${ty})`);
            });

    }, [type, title, isSupportedType]);

    useEffect(() => {
        if (!containerRef.current || !isSupportedType) return;
        const observer = new ResizeObserver(() => {
            window.requestAnimationFrame(() => renderGraph());
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, [renderGraph, isSupportedType]);

    if (!isSupportedType) return null;

    return (
        <div className={`bg-white dark:bg-slate-900 p-6 sm:p-8 border-2 border-gray-100 dark:border-dark-border rounded-3xl shadow-xl overflow-hidden transition-all group ${className || ''}`}>
            <div ref={containerRef} className="w-full min-h-[300px] sm:min-h-[400px] select-none"></div>
            <div className="flex flex-col items-center mt-6 pt-6 border-t border-gray-50 dark:border-dark-border">
                <div className="flex items-center gap-2.5 text-[11px] text-gray-500 font-black uppercase tracking-widest text-center">
                    <svg className="w-4 h-4 animate-bounce flex-shrink-0 text-brand-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"></path></svg>
                    <span>High-Fidelity Interaction: Hover for Values & Insight</span>
                </div>
            </div>
        </div>
    );
};
