
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
            className={`prose prose-sm max-w-none text-gray-800 ${className || ''}`}
            components={{
                a: ({ node, ...props }) => <a {...props} className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer" />,
                p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 leading-relaxed" />,
                ul: ({ node, ...props }) => <ul {...props} className="list-disc pl-5 mb-2 space-y-1" />,
                ol: ({ node, ...props }) => <ol {...props} className="list-decimal pl-5 mb-2 space-y-1" />,
                li: ({ node, ...props }) => <li {...props} className="pl-1" />,
                h1: ({ node, ...props }) => <h1 {...props} className="text-xl font-bold mt-4 mb-2 text-brand-blue" />,
                h2: ({ node, ...props }) => <h2 {...props} className="text-lg font-bold mt-3 mb-2 text-gray-900" />,
                h3: ({ node, ...props }) => <h3 {...props} className="text-md font-bold mt-2 mb-1 text-gray-800" />,
                blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-gray-300 pl-4 italic my-2 bg-gray-50 py-2 pr-2 text-gray-600" />,
                table: ({ node, ...props }) => (
                    <div className="overflow-x-auto my-4 rounded-lg border border-gray-200">
                        <table {...props} className="min-w-full divide-y divide-gray-200" />
                    </div>
                ),
                thead: ({ node, ...props }) => <thead {...props} className="bg-gray-50" />,
                th: ({ node, ...props }) => <th {...props} className="px-4 py-2 text-left text-xs font-bold text-gray-700 uppercase tracking-wider border-r last:border-r-0 border-gray-200" />,
                td: ({ node, ...props }) => <td {...props} className="px-4 py-2 text-sm text-gray-600 border-r last:border-r-0 border-gray-200" />,
                tr: ({ node, ...props }) => <tr {...props} className="bg-white border-b last:border-b-0 hover:bg-gray-50 transition-colors" />,
                code: ({ node, className, children, ...props }) => {
                    const match = /language-(\w+)/.exec(className || '')
                    return !className ? (
                        <code {...props} className="bg-gray-100 rounded px-1 py-0.5 text-sm font-mono text-pink-600">
                            {children}
                        </code>
                    ) : (
                        <code {...props} className={className}>
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
