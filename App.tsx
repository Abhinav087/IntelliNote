import React, { useState, useCallback, useRef, useEffect } from 'react';
import { generateAnswers, extractQuestionsFromFile } from './services/geminiService';
import { Result, Question, ParsedNotes } from './types';
import FileUpload from './components/FileUpload';
import ResultsDisplay from './components/ResultsDisplay';
import { BrainCircuitIcon, DownloadIcon, SparklesIcon, WandIcon, ChevronDownIcon } from './components/Icons';
import { generateAndDownloadFile } from './utils/fileGenerator';
import { parseNoteFiles, extractTextFromFile } from './utils/fileParser';


const App: React.FC = () => {
  const [notesFiles, setNotesFiles] = useState<File[]>([]);
  const [questionsFile, setQuestionsFile] = useState<File | null>(null);
  const [customInstructions, setCustomInstructions] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [processedCount, setProcessedCount] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isDownloadOpen, setIsDownloadOpen] = useState(false);
  const downloadRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (downloadRef.current && !downloadRef.current.contains(event.target as Node)) {
        setIsDownloadOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleGenerateClick = useCallback(async () => {
    if (notesFiles.length === 0 || !questionsFile) {
      setError("Please upload both notes and questions files.");
      return;
    }

    setIsLoading(true);
    setError(null);
    setResults([]);
    setProgress(0);
    setProcessedCount(0);
    setTotalCount(0);

    try {
      const parsedNotes: ParsedNotes = await parseNoteFiles(notesFiles);
      
      const questionsContent = await extractTextFromFile(questionsFile);
      const questions: Question[] = await extractQuestionsFromFile(questionsContent);

      if (questions.length === 0) {
        throw new Error("Could not extract any questions from the question bank file. Please check its format and content.");
      }
      setTotalCount(questions.length);

      const progressCallback = (completed: number, total: number) => {
          setProcessedCount(completed);
          setProgress((completed / total) * 100);
      };

      const generatedResults = await generateAnswers(parsedNotes, questions, customInstructions, progressCallback);
      // Sort results back into original question order
      generatedResults.sort((a, b) => 
        questions.findIndex(q => q.text === a.question) - questions.findIndex(q => q.text === b.question)
      );
      setResults(generatedResults);

    } catch (e: any) {
      console.error(e);
      setError(`An error occurred: ${e.message}`);
    } finally {
      setIsLoading(false);
      setProgress(0);
      setProcessedCount(0);
      setTotalCount(0);
    }
  }, [notesFiles, questionsFile, customInstructions]);
  
  const handleDownload = useCallback((format: 'html' | 'txt' | 'md' | 'pdf' | 'docx') => {
    setIsDownloadOpen(false);
    if (results.length === 0) return;
    generateAndDownloadFile(results, format);
  }, [results]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl mx-auto">
        <header className="text-center mb-8">
          <div className="flex justify-center items-center gap-4 mb-2">
            <BrainCircuitIcon className="h-12 w-12 text-cyan-400" />
            <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-cyan-400 to-purple-500 text-transparent bg-clip-text">
              IntelliNote Q&A
            </h1>
          </div>
          <p className="text-slate-400 max-w-2xl mx-auto">
            Upload your notes and a question bank. Get back comprehensive answers sourced from your notes, enriched by the web, and illustrated with AI-generated images.
          </p>
        </header>

        <main className="bg-slate-800/50 rounded-xl shadow-2xl p-6 backdrop-blur-sm border border-slate-700">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <FileUpload label="1. Upload Your Notes" onFileSelect={setNotesFiles} fileType="notes" multiple />
            <FileUpload label="2. Upload Question Bank" onFileSelect={(files) => setQuestionsFile(files[0] || null)} fileType="questions" />
          </div>
          
          <div className="mb-6">
              <h3 className="font-semibold text-slate-300 flex items-center gap-2 mb-2">
                <WandIcon className="h-5 w-5 text-purple-400" /> 3. Add Custom Instructions (Optional)
              </h3>
              <textarea
                value={customInstructions}
                onChange={(e) => setCustomInstructions(e.target.value)}
                placeholder="e.g., Answer in a friendly tone, focus on historical context, format as bullet points..."
                className="w-full p-3 bg-slate-700/50 border-2 border-slate-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors duration-300 placeholder-slate-500 resize-none"
                rows={3}
                style={{minHeight: '4rem'}}
              />
          </div>

          <div className="flex justify-center mb-6">
            <button
              onClick={handleGenerateClick}
              disabled={notesFiles.length === 0 || !questionsFile || isLoading}
              className="flex items-center gap-2 px-8 py-3 bg-cyan-600 text-white font-semibold rounded-lg shadow-lg hover:bg-cyan-500 disabled:bg-slate-600 disabled:cursor-not-allowed transition-all duration-300 transform hover:scale-105 focus:outline-none focus:ring-4 focus:ring-cyan-400/50"
            >
              <SparklesIcon className="h-5 w-5" />
              {isLoading ? 'Generating...' : 'Generate Answers'}
            </button>
          </div>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-300 p-4 rounded-lg text-center mb-6">
              {error}
            </div>
          )}

          {isLoading && (
             <div className="flex flex-col items-center justify-center p-6 bg-slate-700/50 rounded-lg">
                <div className="w-full bg-slate-600 rounded-full h-2.5 mb-4">
                    <div className="bg-cyan-400 h-2.5 rounded-full" style={{ width: `${progress}%`, transition: 'width 0.3s ease-in-out' }}></div>
                </div>
                <p className="text-slate-300 font-medium">
                    {`Processing... ${processedCount} / ${totalCount} questions complete`}
                </p>
             </div>
          )}
          
          {results.length > 0 && (
            <>
              <div className="flex justify-between items-center mb-4 border-t border-slate-700 pt-6">
                <h2 className="text-2xl font-bold text-slate-200">Generated Results</h2>
                <div className="relative" ref={downloadRef}>
                  <button
                    onClick={() => setIsDownloadOpen(prev => !prev)}
                    className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white font-semibold rounded-lg shadow-md hover:bg-purple-500 transition-colors duration-300 focus:outline-none focus:ring-4 focus:ring-purple-400/50"
                  >
                    <DownloadIcon className="h-5 w-5" />
                    Download As
                    <ChevronDownIcon className={`h-5 w-5 transition-transform ${isDownloadOpen ? 'rotate-180' : ''}`} />
                  </button>
                  {isDownloadOpen && (
                    <div className="absolute right-0 mt-2 w-48 bg-slate-700 border border-slate-600 rounded-md shadow-lg z-10">
                      <a onClick={() => handleDownload('html')} className="block px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 cursor-pointer">HTML</a>
                      <a onClick={() => handleDownload('pdf')} className="block px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 cursor-pointer">PDF</a>
                      <a onClick={() => handleDownload('docx')} className="block px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 cursor-pointer">DOCX</a>
                      <a onClick={() => handleDownload('md')} className="block px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 cursor-pointer">Markdown</a>
                      <a onClick={() => handleDownload('txt')} className="block px-4 py-2 text-sm text-slate-200 hover:bg-slate-600 cursor-pointer">Text</a>
                    </div>
                  )}
                </div>
              </div>
              <ResultsDisplay results={results} />
            </>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;