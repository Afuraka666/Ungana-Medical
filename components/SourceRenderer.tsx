
import React from 'react';

interface SourceRendererProps {
    text: string;
    onSearchClick?: () => void;
}

export const SourceRenderer: React.FC<SourceRendererProps> = ({ text, onSearchClick }) => {
    // Regex for PMID and DOI. DOI regex is specific to its format.
    const pmidRegex = /(\bPMID:?\s*\d{7,8}\b)/gi;
    const doiRegex = /(\b10\.\d{4,9}\/[-._;()/:A-Z0-9]+\b)/gi;

    // Combine regexes for splitting. The capturing group is crucial.
    const combinedRegex = new RegExp(`(${pmidRegex.source}|${doiRegex.source})`, 'gi');
    const parts = text.split(combinedRegex).filter(Boolean);

    return (
        <>
            {parts.map((part, index) => {
                // Check if the part is a PMID
                if (part.match(pmidRegex)) {
                    const pmid = part.match(/\d{7,8}/)![0];
                    return (
                        <a href={`https://pubmed.ncbi.nlm.nih.gov/${pmid}/`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold" key={index}>
                            {part}
                        </a>
                    );
                }
                // Check if the part is a DOI
                if (part.match(doiRegex)) {
                    return (
                        <a href={`https://doi.org/${part}`} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline font-semibold" key={index}>
                            {part}
                        </a>
                    );
                }
                // Render as normal text
                return <span key={index}>{part}</span>;
            })}
            {onSearchClick && (
                <button onClick={onSearchClick} title="Search for this source with AI" className="ml-1.5 inline-block text-gray-400 hover:text-brand-blue transition align-middle">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
                    </svg>
                </button>
            )}
        </>
    );
};
