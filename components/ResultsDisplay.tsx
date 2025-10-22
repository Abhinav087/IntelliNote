import React from 'react';
import { Result } from '../types';
import { LinkIcon } from './Icons';

interface ResultsDisplayProps {
  results: Result[];
}
declare const marked: any;

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ results }) => {
  return (
    <div className="space-y-6">
      {results.map((result, index) => (
        <div key={index} className="bg-slate-800 p-6 rounded-lg shadow-lg border border-slate-700 overflow-hidden">
          <h3 className="text-xl font-bold text-cyan-400 mb-3">
            Q{index + 1}: {result.question}
            {result.marks && <span className="ml-2 text-sm font-normal text-slate-400">({result.marks})</span>}
          </h3>
          <div 
            className="prose prose-invert max-w-none text-slate-300 prose-headings:text-slate-100 prose-strong:text-slate-100 prose-a:text-purple-400 hover:prose-a:text-purple-300"
            dangerouslySetInnerHTML={{ __html: marked.parse(result.answer) }}
          />

          {result.imageUrl && (
            <div className="mt-6">
                <img
                    src={result.imageUrl}
                    alt={`AI generated for "${result.question}"`}
                    className="rounded-lg max-w-full sm:max-w-md mx-auto shadow-xl"
                />
            </div>
          )}

          {result.sources && result.sources.length > 0 && (
            <div className="mt-6 border-t border-slate-700 pt-4">
              <h4 className="font-semibold text-slate-300 mb-2 flex items-center gap-2">
                <LinkIcon className="h-4 w-4" />
                Web Sources
              </h4>
              <ul className="space-y-1">
                {result.sources.map((source, sIndex) => (
                  <li key={sIndex}>
                    <a
                      href={source.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-purple-400 hover:text-purple-300 text-sm hover:underline truncate block"
                    >
                      {source.title || source.uri}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ResultsDisplay;