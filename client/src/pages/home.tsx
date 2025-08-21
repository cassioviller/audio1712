import { useState } from "react";
import { FileUpload } from "@/components/file-upload";
import { ProcessingStatus } from "@/components/processing-status";
import { TranscriptionResults } from "@/components/transcription-results";
import { ErrorDisplay } from "@/components/error-display";
import type { TranscriptionResponse } from "@shared/schema";

type AppState = 'upload' | 'processing' | 'results' | 'error';

export default function Home() {
  const [state, setState] = useState<AppState>('upload');
  const [transcription, setTranscription] = useState<TranscriptionResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [progress, setProgress] = useState(0);

  const handleUploadStart = () => {
    setState('processing');
    setProgress(0);
  };

  const handleUploadSuccess = (result: TranscriptionResponse) => {
    setTranscription(result);
    setState('results');
    setProgress(100);
  };

  const handleUploadError = (errorMessage: string) => {
    setError(errorMessage);
    setState('error');
    setProgress(0);
  };

  const handleNewTranscription = () => {
    setState('upload');
    setTranscription(null);
    setError("");
    setProgress(0);
  };

  return (
    <div className="font-sans bg-gray-50 min-h-screen">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM9 12a3 3 0 1 1 6 0v4a3 3 0 1 1-6 0v-4zm10.5 0A1.5 1.5 0 0 1 21 10.5V12a9 9 0 1 1-18 0v-1.5A1.5 1.5 0 0 1 4.5 9 1.5 1.5 0 0 1 6 10.5V12a6 6 0 1 0 12 0v-1.5A1.5 1.5 0 0 1 19.5 9a1.5 1.5 0 0 1 1.5 1.5z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-semibold text-gray-900">AudioScript</h1>
                <p className="text-sm text-secondary">Transcrição rápida de áudio</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-sm text-secondary">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
              </svg>
              <span>Seguro & Privado</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {state === 'upload' && (
          <FileUpload
            onUploadStart={handleUploadStart}
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
            onProgress={setProgress}
          />
        )}

        {state === 'processing' && (
          <>
            <FileUpload
              onUploadStart={handleUploadStart}
              onUploadSuccess={handleUploadSuccess}
              onUploadError={handleUploadError}
              onProgress={setProgress}
              disabled
            />
            <ProcessingStatus progress={progress} />
          </>
        )}

        {state === 'results' && transcription && (
          <TranscriptionResults
            transcription={transcription}
            onNewTranscription={handleNewTranscription}
          />
        )}

        {state === 'error' && (
          <ErrorDisplay
            error={error}
            onTryAgain={handleNewTranscription}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="mt-16 border-t border-gray-200 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center">
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-6 h-6 bg-primary rounded-lg flex items-center justify-center">
                <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                </svg>
              </div>
              <span className="font-semibold text-gray-900">AudioScript</span>
            </div>
            <p className="text-sm text-secondary mb-4">
              Transcrição rápida e segura de arquivos de áudio
            </p>
            <div className="flex items-center justify-center space-x-6 text-sm text-secondary">
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/>
                </svg>
                <span>Processamento Local</span>
              </div>
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                </svg>
                <span>Resultado Rápido</span>
              </div>
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M16 1H8C6.34 1 5 2.34 5 4v16c0 1.66 1.34 3 3 3h8c1.66 0 3-1.34 3-3V4c0-1.66-1.34-3-3-3z"/>
                </svg>
                <span>Mobile Friendly</span>
              </div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
