import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardDescription } from "@/components/ui/card";
import { useFileUpload } from "@/hooks/use-file-upload";
import { formatFileSize } from "@/lib/file-utils";
import type { TranscriptionResponse } from "@shared/schema";
import { cn } from "@/lib/utils";

interface FileUploadProps {
  onUploadStart: () => void;
  onUploadSuccess: (result: TranscriptionResponse) => void;
  onUploadError: (error: string) => void;
  onProgress: (progress: number) => void;
  disabled?: boolean;
}

export function FileUpload({
  onUploadStart,
  onUploadSuccess,
  onUploadError,
  onProgress,
  disabled = false,
}: FileUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { uploadFile, isUploading } = useFileUpload({
    onUploadStart,
    onUploadSuccess,
    onUploadError,
    onProgress,
  });

  const handleFileSelect = (file: File) => {
    // Validate file type
    const allowedTypes = [
      'audio/mpeg', 
      'audio/wav', 
      'audio/x-m4a', 
      'audio/mp4',
      'audio/m4a',
      'audio/mp3',
      'audio/aac',
      'audio/opus',
      'audio/flac',
      'audio/ogg',
      'audio/webm'
    ];
    
    // Also check file extension as backup (including formats with auto-conversion)
    const allowedExtensions = ['.mp3', '.wav', '.m4a', '.mp4', '.flac', '.ogg', '.webm', '.opus'];
    const hasValidExtension = allowedExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    if (!allowedTypes.includes(file.type) && !hasValidExtension) {
      onUploadError('Formato de arquivo não suportado. Use MP3, WAV, M4A, FLAC, OGG, WEBM ou OPUS.');
      return;
    }

    // Validate file size (100MB - large files are handled by chunking)
    if (file.size > 104857600) {
      onUploadError('Arquivo muito grande. O tamanho máximo é 100MB.');
      return;
    }

    setSelectedFile(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (disabled || isUploading) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!disabled && !isUploading) {
      setIsDragOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  };

  const handleSelectFile = () => {
    fileInputRef.current?.click();
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleTranscribe = async () => {
    if (selectedFile) {
      await uploadFile(selectedFile);
    }
  };

  return (
    <div className="mb-8">
      <Card>
        <CardHeader>
          <h2 className="text-lg font-medium text-gray-900">Carregar Arquivo de Áudio</h2>
          <CardDescription>
            Formatos suportados: MP3, WAV, M4A, FLAC, OGG, WEBM, OPUS<br/>
            <span className="text-sm text-gray-500">
              Arquivos grandes são automaticamente divididos e processados em segmentos
            </span>
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {!selectedFile ? (
            <>
              <div
                className={cn(
                  "border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer",
                  isDragOver ? "border-primary bg-blue-50" : "border-gray-300",
                  disabled && "opacity-50 cursor-not-allowed"
                )}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onClick={disabled ? undefined : handleSelectFile}
                data-testid="upload-zone"
              >
                <div className="flex flex-col items-center">
                  <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Arraste seu arquivo aqui</h3>
                  <p className="text-secondary mb-4">ou clique para selecionar</p>
                  <Button 
                    type="button"
                    disabled={disabled}
                    data-testid="button-select-file"
                  >
                    Selecionar Arquivo
                  </Button>
                </div>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={handleFileInputChange}
                className="hidden"
                data-testid="input-file"
              />
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-gray-50 rounded-lg p-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                    </svg>
                  </div>
                  <div>
                    <p className="font-medium text-gray-900" data-testid="text-filename">
                      {selectedFile.name}
                    </p>
                    <p className="text-sm text-secondary" data-testid="text-filesize">
                      {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRemoveFile}
                  disabled={disabled || isUploading}
                  data-testid="button-remove-file"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z"/>
                  </svg>
                </Button>
              </div>
              
              <div className="flex space-x-3">
                <Button
                  onClick={handleTranscribe}
                  disabled={disabled || isUploading}
                  className="flex-1"
                  data-testid="button-transcribe"
                >
                  <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8,5.14V19.14L19,12.14L8,5.14Z"/>
                  </svg>
                  {isUploading ? 'Processando...' : 'Iniciar Transcrição'}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleRemoveFile}
                  disabled={disabled || isUploading}
                  data-testid="button-cancel"
                >
                  Cancelar
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
