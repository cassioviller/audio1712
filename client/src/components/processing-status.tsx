import { Card, CardContent, CardHeader } from "@/components/ui/card";

interface ProcessingStatusProps {
  progress: number;
}

export function ProcessingStatus({ progress }: ProcessingStatusProps) {
  const getProgressSteps = (progress: number) => {
    return [
      { label: "Arquivo carregado", completed: progress > 0 },
      { label: "Processando áudio...", completed: progress >= 100, inProgress: progress > 0 && progress < 100 },
      { label: "Gerando transcrição", completed: progress >= 100 },
    ];
  };

  const steps = getProgressSteps(progress);

  return (
    <div className="mb-8" data-testid="processing-status">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Processando Áudio</h3>
            <div className="flex items-center space-x-2 text-warning">
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-warning"></div>
              <span className="text-sm font-medium">Em andamento</span>
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between text-sm text-secondary mb-2">
              <span>Progresso</span>
              <span data-testid="text-progress">{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-warning h-2 rounded-full transition-all duration-300" 
                style={{ width: `${progress}%` }}
                data-testid="progress-bar"
              />
            </div>
          </div>

          {/* Processing Steps */}
          <div className="space-y-3">
            {steps.map((step, index) => (
              <div key={index} className="flex items-center space-x-3">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  step.completed 
                    ? "bg-success" 
                    : step.inProgress 
                      ? "bg-warning" 
                      : "bg-gray-200"
                }`}>
                  {step.completed ? (
                    <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21,7L9,19L3.5,13.5L4.91,12.09L9,16.17L19.59,5.59L21,7Z"/>
                    </svg>
                  ) : step.inProgress ? (
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                  ) : null}
                </div>
                <span className={`text-sm ${
                  step.completed || step.inProgress ? "text-gray-700" : "text-secondary"
                }`}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
