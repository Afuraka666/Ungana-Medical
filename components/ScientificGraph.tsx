
import React, { useEffect, useRef } from 'react';

declare const d3: any;

interface ScientificGraphProps {
    type: 'oxygen_dissociation' | 'other';
    title: string;
    className?: string;
}

export const ScientificGraph: React.FC<ScientificGraphProps> = ({ type, title, className }) => {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!containerRef.current) return;
        const container = d3.select(containerRef.current);
        container.selectAll('*').remove();

        const margin = { top: 40, right: 30, bottom: 50, left: 60 };
        const width = containerRef.current.clientWidth - margin.left - margin.right;
        const height = 300 - margin.top - margin.bottom;

        const isDark = document.documentElement.classList.contains('dark');
        const textColor = isDark ? '#e2e8f0' : '#1e293b';
        const gridColor = isDark ? '#334155' : '#e2e8f0';

        const svg = container.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        if (type === 'oxygen_dissociation') {
            const n = 2.8;
            const p50 = 26.6;

            const generateData = (p50Val: number) => {
                const arr = [];
                for (let p = 0; p <= 110; p += 1) {
                    const sat = (Math.pow(p, n) / (Math.pow(p, n) + Math.pow(p50Val, n))) * 100;
                    arr.push({ x: p, y: sat });
                }
                return arr;
            };

            const dataNormal = generateData(p50);
            const dataRight = generateData(p50 + 8);
            const dataLeft = generateData(p50 - 8);

            const x = d3.scaleLinear().domain([0, 110]).range([0, width]);
            const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);

            // Gridlines
            svg.append('g').attr('class', 'grid').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(5).tickSize(-height).tickFormat('')).attr('stroke', gridColor).attr('stroke-opacity', 0.1);
            svg.append('g').attr('class', 'grid').call(d3.axisLeft(y).ticks(5).tickSize(-width).tickFormat('')).attr('stroke', gridColor).attr('stroke-opacity', 0.1);

            // Axes
            const xAxis = svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x).ticks(10));
            xAxis.selectAll('text').attr('fill', textColor);
            xAxis.selectAll('line').attr('stroke', textColor);
            xAxis.select('.domain').attr('stroke', textColor);

            const yAxis = svg.append('g').call(d3.axisLeft(y).ticks(10));
            yAxis.selectAll('text').attr('fill', textColor);
            yAxis.selectAll('line').attr('stroke', textColor);
            yAxis.select('.domain').attr('stroke', textColor);

            // Labels
            svg.append('text').attr('x', width / 2).attr('y', height + 40).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', textColor).attr('font-weight', '600').text('Partial Pressure of Oxygen (PO₂, mmHg)');
            svg.append('text').attr('transform', 'rotate(-90)').attr('y', -45).attr('x', -height / 2).attr('text-anchor', 'middle').attr('font-size', '11px').attr('fill', textColor).attr('font-weight', '600').text('Hb Saturation (SaO₂, %)');
            svg.append('text').attr('x', width / 2).attr('y', -15).attr('text-anchor', 'middle').attr('font-weight', 'bold').attr('fill', textColor).attr('font-size', '14px').text(title);

            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);

            // Left Shift
            svg.append('path').datum(dataLeft).attr('fill', 'none').attr('stroke', isDark ? '#38bdf8' : '#3b82f6').attr('stroke-width', 2).attr('stroke-dasharray', '5,3').attr('d', line).attr('opacity', 0.7);
            // Right Shift
            svg.append('path').datum(dataRight).attr('fill', 'none').attr('stroke', '#f87171').attr('stroke-width', 2).attr('stroke-dasharray', '5,3').attr('d', line).attr('opacity', 0.7);
            // Normal
            svg.append('path').datum(dataNormal).attr('fill', 'none').attr('stroke', isDark ? '#60a5fa' : '#1e3a8a').attr('stroke-width', 3.5).attr('d', line);

            // P50 markers
            svg.append('line').attr('x1', x(p50)).attr('y1', y(0)).attr('x2', x(p50)).attr('y2', y(50)).attr('stroke', isDark ? '#94a3b8' : '#64748b').attr('stroke-width', 1).attr('stroke-dasharray', '2,2');
            svg.append('line').attr('x1', x(0)).attr('y1', y(50)).attr('x2', x(p50)).attr('y2', y(50)).attr('stroke', isDark ? '#94a3b8' : '#64748b').attr('stroke-width', 1).attr('stroke-dasharray', '2,2');
            svg.append('circle').attr('cx', x(p50)).attr('cy', y(50)).attr('r', 5).attr('fill', '#ef4444').attr('stroke', '#fff').attr('stroke-width', 2);
            svg.append('text').attr('x', x(p50) + 8).attr('y', y(50) - 8).attr('font-size', '11px').attr('fill', '#ef4444').attr('font-weight', 'bold').text(`P₅₀ ≈ ${p50} mmHg`);
        }
    }, [type, title]);

    return (
        <div className={`bg-white dark:bg-slate-900 p-4 border border-gray-200 dark:border-dark-border rounded-lg shadow-inner overflow-hidden transition-colors ${className || ''}`}>
            <div ref={containerRef} className="w-full"></div>
            <div className="flex justify-center gap-6 mt-3 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-400 border-t border-dashed"></span> Left Shift (↑pH, ↓T)</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-1 bg-brand-blue dark:bg-blue-500"></span> Physiological Normal</span>
                <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-red-400 border-t border-dashed"></span> Right Shift (↓pH, ↑T)</span>
            </div>
        </div>
    );
};
