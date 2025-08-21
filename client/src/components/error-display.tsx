import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ErrorDisplayProps {
  error: string;
  onTryAgain: () => void;
}

export function ErrorDisplay({ error, onTryAgain }: ErrorDisplayProps) {
  const getSolutions = () => [
    "Verifique se o arquivo está nos formatos MP3, WAV ou M4A",
    "Certifique-se de que o arquivo tem menos de 10MB",
    "Verifique se o arquivo não está corrompido",
  ];

  return (
    <div data-testid="error-display">
      <Card className="border-red-200">
        <CardHeader className="border-b border-red-100">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-error rounded-full flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-medium text-error">Erro na Transcrição</h2>
              <p className="text-sm text-red-600 mt-1">Não foi possível processar o arquivo de áudio</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6">
          <div className="bg-red-50 rounded-lg p-4 mb-6">
            <p className="text-sm text-red-800" data-testid="text-error-message">
              {error}
            </p>
          </div>
          
          <div className="space-y-3 mb-6">
            <h3 className="font-medium text-gray-900">Possíveis soluções:</h3>
            <ul className="space-y-2 text-sm text-secondary">
              {getSolutions().map((solution, index) => (
                <li key={index} className="flex items-start space-x-2">
                  <svg className="w-4 h-4 text-success mt-1 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/>
                  </svg>
                  <span>{solution}</span>
                </li>
              ))}
            </ul>
          </div>
          
          <Button onClick={onTryAgain} data-testid="button-try-again">
            <svg className="w-4 h-4 mr-2" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.65,6.35C16.2,4.9 14.21,4 12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20C15.73,20 18.84,17.45 19.73,14H17.65C16.83,16.33 14.61,18 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6C13.66,6 15.14,6.69 16.22,7.78L13,11H20V4L17.65,6.35Z"/>
            </svg>
            Tentar Novamente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
