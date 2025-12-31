
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import remarkGfm from 'remark-gfm';
import rehypeKatex from 'rehype-katex';

interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    return (
        <ReactMarkdown
            remarkPlugins={[remarkMath, remarkGfm]}
            rehypePlugins={[rehypeKatex]}
            className={`prose prose-sm max-w-none text-gray-800 dark:text-slate-200 ${className || ''}`}
            components={{
                a: ({ node, ...props }) => <a {...props} className="text-blue-600 dark:text-blue-400 hover:underline font-bold" target="_blank" rel="noopener noreferrer" />,
                p: ({ node, ...props }) => <p {...props} className="mb-4 last:mb-0 leading-relaxed font-serif" />,
                ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-4 space-y-2" />,
                ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-4 space-y-2" />,
                h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-black mt-6 mb-4 text-brand-blue dark:text-brand-blue-light" />,
                h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-black mt-5 mb-3 text-gray-900 dark:text-slate-100 border-b-2 border-slate-100 dark:border-dark-border pb-1" />,
                h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-black mt-4 mb-2 text-gray-800 dark:text-slate-200" />,
                blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-brand-blue/20 pl-4 italic my-4 bg-slate-50 dark:bg-slate-800/40 py-3 pr-3 text-gray-600 dark:text-slate-400 rounded-r-xl" />,
                table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-6 bg-white dark:bg-slate-900 shadow-sm border border-black dark:border-white">
                        <table {...props} className="min-w-full border-collapse" />
                    </div>
                ),
                thead: ({ node, ...props }) => <thead {...props} className="bg-gray-100 dark:bg-slate-800 border-b-2 border-black dark:border-white" />,
                th: ({ node, ...props }) => (
                    <th 
                        {...props} 
                        className="px-4 py-2 text-left text-xs font-black text-black dark:text-white uppercase tracking-tight border border-black dark:border-white" 
                    />
                ),
                td: ({ node, ...props }) => (
                    <td 
                        {...props} 
                        className="px-4 py-2 text-sm text-black dark:text-slate-200 border border-black dark:border-white font-medium bg-white dark:bg-slate-900 first:bg-gray-50 first:dark:bg-slate-800/50 first:font-bold" 
                    />
                ),
                tr: ({ node, ...props }) => (
                    <tr 
                        {...props} 
                        className="transition-colors hover:bg-gray-50 dark:hover:bg-slate-800/30" 
                    />
                ),
                code: ({ node, className, children, ...props }) => {
                    const isInline = !className;
                    return isInline ? (
                        <code {...props} className="bg-slate-100 dark:bg-slate-800 rounded-md px-1.5 py-0.5 text-xs font-mono font-bold text-blue-700 dark:text-blue-400">
                            {children}
                        </code>
                    ) : (
                        <code {...props} className={`${className} block p-4 rounded-xl bg-slate-900 text-slate-100 overflow-x-auto font-mono text-xs leading-relaxed`}>
                            {children}
                        </code>
                    )
                }
            }}
        >
            {content}
        </ReactMarkdown>
    );
};
