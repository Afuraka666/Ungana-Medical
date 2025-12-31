
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

        const svg = container.append('svg')
            .attr('width', width + margin.left + margin.right)
            .attr('height', height + margin.top + margin.bottom)
            .append('g')
            .attr('transform', `translate(${margin.left},${margin.top})`);

        if (type === 'oxygen_dissociation') {
            // Bohr Effect curve simulation using the Hill Equation
            // Saturation = (P^n) / (P^n + P50^n)
            const n = 2.8; // Hill coefficient
            const p50 = 26.6; // mmHg

            const generateData = (p50Val: number) => {
                const arr = [];
                for (let p = 0; p <= 100; p += 1) {
                    const sat = (Math.pow(p, n) / (Math.pow(p, n) + Math.pow(p50Val, n))) * 100;
                    arr.push({ x: p, y: sat });
                }
                return arr;
            };

            const dataNormal = generateData(p50);
            const dataRight = generateData(p50 + 6); // Shift Right (Acidosis/Hypercapnia)
            const dataLeft = generateData(p50 - 6);  // Shift Left (Alkalosis/Hypocapnia)

            const x = d3.scaleLinear().domain([0, 100]).range([0, width]);
            const y = d3.scaleLinear().domain([0, 100]).range([height, 0]);

            // Axes
            svg.append('g').attr('transform', `translate(0,${height})`).call(d3.axisBottom(x));
            svg.append('g').call(d3.axisLeft(y));

            // Labels
            svg.append('text').attr('x', width / 2).attr('y', height + 40).attr('text-anchor', 'middle').attr('font-size', '12px').text('Partial Pressure of Oxygen (PO₂, mmHg)');
            svg.append('text').attr('transform', 'rotate(-90)').attr('y', -45).attr('x', -height / 2).attr('text-anchor', 'middle').attr('font-size', '12px').text('Hemoglobin Saturation (SaO₂, %)');
            svg.append('text').attr('x', width / 2).attr('y', -15).attr('text-anchor', 'middle').attr('font-weight', 'bold').text(title);

            const line = d3.line().x((d: any) => x(d.x)).y((d: any) => y(d.y)).curve(d3.curveBasis);

            // Left Shift
            svg.append('path').datum(dataLeft).attr('fill', 'none').attr('stroke', '#93c5fd').attr('stroke-width', 2).attr('stroke-dasharray', '4,4').attr('d', line);
            // Right Shift
            svg.append('path').datum(dataRight).attr('fill', 'none').attr('stroke', '#fca5a5').attr('stroke-width', 2).attr('stroke-dasharray', '4,4').attr('d', line);
            // Normal
            svg.append('path').datum(dataNormal).attr('fill', 'none').attr('stroke', '#1e3a8a').attr('stroke-width', 3).attr('d', line);

            // P50 marker
            svg.append('line').attr('x1', x(p50)).attr('y1', y(0)).attr('x2', x(p50)).attr('y2', y(50)).attr('stroke', '#9ca3af').attr('stroke-width', 1).attr('stroke-dasharray', '2,2');
            svg.append('line').attr('x1', x(0)).attr('y1', y(50)).attr('x2', x(p50)).attr('y2', y(50)).attr('stroke', '#9ca3af').attr('stroke-width', 1).attr('stroke-dasharray', '2,2');
            svg.append('circle').attr('cx', x(p50)).attr('cy', y(50)).attr('r', 4).attr('fill', '#ef4444');
            svg.append('text').attr('x', x(p50) + 5).attr('y', y(50) - 5).attr('font-size', '10px').attr('fill', '#ef4444').text(`P₅₀ ≈ ${p50} mmHg`);
        }
    }, [type, title]);

    return (
        <div className={`bg-white p-4 border border-gray-200 rounded-lg shadow-inner ${className || ''}`}>
            <div ref={containerRef} className="w-full"></div>
            <div className="flex justify-center gap-4 mt-2 text-[10px] text-gray-500">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#93c5fd] border-t border-dashed"></span> Left Shift</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#1e3a8a]"></span> Normal</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#fca5a5] border-t border-dashed"></span> Right Shift</span>
            </div>
        </div>
    );
};
