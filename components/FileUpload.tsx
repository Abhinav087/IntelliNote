import React, { useState, useRef, useCallback } from 'react';
import { UploadIcon, FileTextIcon, CheckCircleIcon } from './Icons';

interface FileUploadProps {
  label: string;
  onFileSelect: (files: File[]) => void;
  fileType: 'notes' | 'questions';
  multiple?: boolean;
}

const ALLOWED_MIME_TYPES = [
  'text/plain',
  'text/markdown',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
];

const ALLOWED_EXTENSIONS = ['.txt', '.md', '.pdf', '.docx'];


const FileUpload: React.FC<FileUploadProps> = ({ label, onFileSelect, fileType, multiple = false }) => {
  const [fileCount, setFileCount] = useState<number>(0);
  const [fileNames, setFileNames] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (files: FileList | null) => {
    if (files && files.length > 0) {
      const validFiles = Array.from(files).filter(file => {
        const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();
        return ALLOWED_MIME_TYPES.includes(file.type) || ALLOWED_EXTENSIONS.includes(fileExtension);
      });
      
      if (validFiles.length !== files.length) {
          alert(`Some files have invalid types. Please upload only: ${ALLOWED_EXTENSIONS.join(', ')}`);
      }

      if (validFiles.length > 0) {
        setFileCount(validFiles.length);
        setFileNames(validFiles.map(f => f.name).join(', '));
        onFileSelect(validFiles);
      }
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };
  
  const handleDragEnter = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    handleFileChange(e.dataTransfer.files);
  }, [handleFileChange]);


  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold text-slate-300 flex items-center gap-2">
        <FileTextIcon className="h-5 w-5 text-cyan-400" /> {label}
      </h3>
      <label
        htmlFor={`file-upload-${fileType}`}
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg cursor-pointer transition-colors duration-300
          ${isDragging ? 'border-cyan-400 bg-slate-700/50' : 'border-slate-600 hover:border-cyan-500 hover:bg-slate-700/30'}
          ${fileCount > 0 ? 'border-green-500 bg-green-500/10' : ''}`}
      >
        <div className="flex flex-col items-center text-center">
            {fileCount > 0 ? (
                <>
                    <CheckCircleIcon className="h-10 w-10 text-green-400 mb-2"/>
                    <p className="font-semibold text-green-300">{fileCount} file{fileCount > 1 ? 's' : ''} selected</p>
                    <p className="text-sm text-slate-400 truncate max-w-full px-4" title={fileNames}>{fileNames}</p>
                    <p className="text-sm text-slate-500 mt-1">Click or drag to replace</p>
                </>
            ) : (
                <>
                    <UploadIcon className="h-10 w-10 text-slate-500 mb-2"/>
                    <p className="font-semibold text-slate-300">
                        <span className="text-cyan-400">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-sm text-slate-500">.txt, .md, .pdf, .docx</p>
                </>
            )}
        </div>
        <input
          id={`file-upload-${fileType}`}
          ref={inputRef}
          type="file"
          accept=".txt,.md,.pdf,.docx"
          className="hidden"
          multiple={multiple}
          onChange={(e) => handleFileChange(e.target.files)}
        />
      </label>
    </div>
  );
};

export default FileUpload;