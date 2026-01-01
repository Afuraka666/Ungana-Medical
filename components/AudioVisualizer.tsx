
import React, { useEffect, useRef } from 'react';

interface AudioVisualizerProps {
    isListening: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ isListening }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyzerRef = useRef<AnalyserNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);

    useEffect(() => {
        if (!isListening) {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            return;
        }

        const startVisualizer = async () => {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
                const source = audioContextRef.current.createMediaStreamSource(stream);
                analyzerRef.current = audioContextRef.current.createAnalyser();
                analyzerRef.current.fftSize = 64;
                source.connect(analyzerRef.current);

                const bufferLength = analyzerRef.current.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                const canvas = canvasRef.current;
                if (!canvas) return;
                const ctx = canvas.getContext('2d');
                if (!ctx) return;

                const draw = () => {
                    if (!isListening) return;
                    animationFrameRef.current = requestAnimationFrame(draw);
                    analyzerRef.current?.getByteFrequencyData(dataArray);

                    ctx.clearRect(0, 0, canvas.width, canvas.height);
                    
                    const barWidth = (canvas.width / bufferLength) * 2.5;
                    let x = 0;

                    for (let i = 0; i < bufferLength; i++) {
                        // Enhance visual dynamic range
                        const barHeight = (dataArray[i] / 255) * canvas.height * 1.2;
                        
                        // Vibrant medical blue color
                        ctx.fillStyle = `rgba(59, 130, 246, ${0.5 + (dataArray[i] / 510)})`;
                        ctx.fillRect(x, canvas.height - barHeight, barWidth, barHeight);
                        
                        x += barWidth + 1;
                    }
                };
                draw();
            } catch (err) {
                console.error("Visualizer failed", err);
            }
        };

        startVisualizer();

        return () => {
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            audioContextRef.current?.close();
        };
    }, [isListening]);

    if (!isListening) return null;

    return (
        <canvas 
            ref={canvasRef} 
            width="40" 
            height="20" 
            className="rounded-sm opacity-90 shadow-sm"
        />
    );
};
