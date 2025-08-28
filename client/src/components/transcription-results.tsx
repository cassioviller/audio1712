import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import type { TranscriptionResponse } from "@shared/schema";

interface TranscriptionResultsProps {
  transcription: TranscriptionResponse;
  onNewTranscription: () => void;
}

export function TranscriptionResults({ transcription, onNewTranscription }: TranscriptionResultsProps) {
  const { toast } = useToast();

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcription.transcriptionText);
      toast({
        title: "Copiado!",
        description: "Texto copiado para a área de transferência.",
      });
    } catch (error) {
      toast({
        title: "Erro ao copiar",
        description: "Não foi possível copiar o texto. Tente novamente.",
        variant: "destructive",
      });
    }
  };

  const handleDownloadTranscription = () => {
    const blob = new Blob([transcription.transcriptionText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${transcription.filename.replace(/\.[^/.]+$/, '')}_transcrição.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast({
      title: "Download iniciado",
      description: "A transcrição foi salva como arquivo de texto.",
    });
  };

  const formatDuration = (duration?: number) => {
    if (!duration) return "N/A";
    const minutes = Math.floor(duration / 60);
    const seconds = Math.floor(duration % 60);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  const formatProcessingTime = (time: number) => {
    return time < 1 ? `${Math.round(time * 1000)}ms` : `${time.toFixed(1)}s`;
  };

  return (
    <div data-testid="transcription-results">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-medium text-gray-900">Transcrição Concluída</h2>
              <p className="text-sm text-secondary mt-1">
                <svg className="inline w-4 h-4 mr-1" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/>
                </svg>
                Processado em <span data-testid="text-processing-time">{formatProcessingTime(transcription.processingTime)}</span>
              </p>
            </div>
            <div className="flex items-center space-x-2 text-success">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/>
              </svg>
              <span className="text-sm font-medium">Sucesso</span>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          {/* Transcription Text */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center space-x-2">
                <svg className="w-4 h-4 text-secondary" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
                </svg>
                <span className="text-sm font-medium text-secondary">TRANSCRIÇÃO</span>
              </div>
              <div className="flex items-center space-x-2 text-sm text-secondary">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M17,13H13V17H11V13H7V11H11V7H13V11H17V13Z"/>
                </svg>
                <span data-testid="text-word-count">{transcription.wordCount} palavras</span>
              </div>
            </div>
            
            <div className="prose max-w-none">
              <div 
                className="text-gray-800 leading-relaxed font-mono text-sm whitespace-pre-wrap"
                data-testid="text-transcription"
              >
                {transcription.transcriptionText}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 mb-6">
            <Button 
              onClick={handleCopyToClipboard}
              className="flex-1"
              data-testid="button-copy"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19,21H8V7H19M19,5H8A2,2 0 0,0 6,7V21A2,2 0 0,0 8,23H19A2,2 0 0,0 21,21V7A2,2 0 0,0 19,5M16,1H4A2,2 0 0,0 2,3V17H4V3H16V1Z"/>
              </svg>
              Copiar Texto
            </Button>
            <Button 
              onClick={handleDownloadTranscription}
              className="flex-1 bg-success hover:bg-green-600"
              data-testid="button-download"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M5,20H19V18H5M19,9H15V3H9V9H5L12,16L19,9Z"/>
              </svg>
              Baixar (.txt)
            </Button>
            <Button 
              variant="outline"
              onClick={onNewTranscription}
              className="sm:w-auto px-6"
              data-testid="button-new-transcription"
            >
              <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19,13H13V19H11V13H5V11H11V5H13V11H19V13Z"/>
              </svg>
              Nova Transcrição
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Transcription Stats */}
      <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">Duração do Áudio</p>
              <p className="text-lg font-semibold text-gray-900" data-testid="stat-duration">
                {formatDuration(transcription.duration)}
              </p>
            </div>
            <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M16.2,16.2L11,13V7H12.5V12.2L17,14.9L16.2,16.2Z"/>
            </svg>
          </div>
        </Card>
        
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary">Palavras</p>
              <p className="text-lg font-semibold text-gray-900" data-testid="stat-words">
                {transcription.wordCount}
              </p>
            </div>
            <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5,3H7V5H21V7H7V9H5V3M3,11H5V13H19V15H5V17H3V11M5,19H7V21H21V23H7V21H5V19Z"/>
            </svg>
          </div>
        </Card>
        
{transcription.totalChunks && transcription.totalChunks > 1 ? (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-secondary">Segmentos</p>
                <p className="text-lg font-semibold text-gray-900" data-testid="stat-chunks">
                  {transcription.totalChunks}
                </p>
              </div>
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19,3H5C3.9,3 3,3.9 3,5V19C3,20.1 3.9,21 5,21H19C20.1,21 21,20.1 21,19V5C21,3.9 20.1,3 19,3M19,19H5V5H19V19M17,17V15H7V17H17M17,13V11H7V13H17M17,9V7H7V9H17Z"/>
              </svg>
            </div>
          </Card>
        ) : (
          <Card className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-secondary">Confiança</p>
                <p className="text-lg font-semibold text-gray-900" data-testid="stat-confidence">
                  {transcription.confidence ? `${Math.round(transcription.confidence * 100)}%` : "N/A"}
                </p>
              </div>
              <svg className="w-5 h-5 text-primary" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16,6L18.29,8.29L13.41,13.17L9.41,9.17L2,16.59L3.41,18L9.41,12L13.41,16L19.71,9.71L22,12V6H16Z"/>
              </svg>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
