
import React from 'react';
import type { KnowledgeNode } from '../types';
import { DisciplineColors } from './KnowledgeMap';

interface ConceptCardProps {
  nodeInfo: {
    node: KnowledgeNode;
    abstract: string;
    loading: boolean;
  };
  onClose: () => void;
  onDiscuss: (nodeInfo: ConceptCardProps['nodeInfo']) => void;
  T: Record<string, any>;
}

const LoadingSpinner: React.FC = () => (
    <div className="flex justify-center items-center h-full">
        <svg className="animate-spin h-6 w-6 text-brand-blue" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
    </div>
);

export const ConceptCard: React.FC<ConceptCardProps> = ({ nodeInfo, onClose, onDiscuss, T }) => {
  const { node, abstract, loading } = nodeInfo;
  const color = DisciplineColors[node.discipline] || '#6b7280';
  
  return (
    <div className="absolute top-4 right-4 w-11/12 max-w-sm sm:w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-5 animate-fade-in z-10">
      <div className="flex justify-between items-start">
        <div>
          <span
            className="text-xs font-semibold px-2.5 py-0.5 rounded-full mb-2 inline-block"
            style={{ backgroundColor: `${color}20`, color: color }}
          >
            {node.discipline}
          </span>
          <h3 className="text-xl font-bold text-gray-800">{node.label}</h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition"
          aria-label="Close"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
        </button>
      </div>
      <div className="mt-4 text-sm text-gray-600 min-h-[60px]">
        {loading ? (
          <LoadingSpinner />
        ) : (
          <p className="whitespace-pre-wrap">{abstract}</p>
        )}
      </div>
      <div className="mt-4 pt-3 border-t border-gray-200">
          <button
              onClick={() => onDiscuss(nodeInfo)}
              disabled={loading}
              className="w-full bg-blue-100 hover:bg-blue-200 text-brand-blue font-semibold py-2 px-4 rounded-md transition text-sm disabled:bg-gray-200 disabled:text-gray-400 disabled:cursor-not-allowed"
          >
              {T.discussButton}
          </button>
      </div>
    </div>
  );
};
