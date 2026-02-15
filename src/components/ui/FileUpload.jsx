import { useRef, useState } from 'react';
import { Upload, X, FileText, CheckCircle } from 'lucide-react';
import { cn } from '../../lib/utils';
import Papa from 'papaparse';

const FileUpload = ({ label, onDataLoaded, acceptedFileTypes = ".csv" }) => {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const validateAndParse = (file) => {
    if (!file) return;
    
    // Simple validation
    if (file.type !== "text/csv" && !file.name.endsWith('.csv')) {
      setError("Please upload a valid CSV file.");
      return;
    }

    setLoading(true);
    setError(null);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        setLoading(false);
        if (results.errors && results.errors.length > 0) {
          console.error("CSV Parse Errors", results.errors);
          // We might still have valid data, so we don't necessarily block,
          // but we could warn. For now, let's assume success if we got rows.
        }
        
        if (results.data && results.data.length > 0) {
          setFile(file);
          onDataLoaded(results.data, file.name);
        } else {
          setError("File appears to be empty or invalid.");
        }
      },
      error: (err) => {
        setLoading(false);
        setError("Failed to parse CSV: " + err.message);
      }
    });

  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndParse(e.dataTransfer.files[0]);
    }
  };

  const handleChange = (e) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndParse(e.target.files[0]);
    }
  };

  const clearFile = () => {
    setFile(null);
    setError(null);
    onDataLoaded(null);
    if (inputRef.current) {
      inputRef.current.value = "";
    }
  };

  return (
    <div className="w-full">
      <label className="block text-sm font-medium text-muted-foreground mb-2">
        {label}
      </label>
      
      {!file ? (
        <div
          className={cn(
            "relative flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors",
            dragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/50",
            error ? "border-destructive/50 bg-destructive/5" : ""
          )}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            accept={acceptedFileTypes}
            onChange={handleChange}
          />
          
          <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center">
            {loading ? (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mb-2"></div>
            ) : (
              <Upload className={cn("w-8 h-8 mb-2", error ? "text-destructive" : "text-muted-foreground")} />
            )}
            <p className="text-sm text-foreground mb-1">
              <span className="font-semibold">Click to upload</span> or drag and drop
            </p>
            <p className="text-xs text-muted-foreground">CSV</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between p-3 border rounded-lg bg-card/50">
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="min-w-10 h-10 rounded bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate">{file.name}</span>
              <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(0)} KB</span>
            </div>
          </div>
          <button 
            onClick={clearFile}
            className="p-1 hover:bg-muted rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {error && (
        <p className="mt-2 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
};

export default FileUpload;
