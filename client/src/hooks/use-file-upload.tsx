import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import type { TranscriptionResponse } from "@shared/schema";

interface UseFileUploadProps {
  onUploadStart: () => void;
  onUploadSuccess: (result: TranscriptionResponse) => void;
  onUploadError: (error: string) => void;
  onProgress: (progress: number) => void;
}

export function useFileUpload({
  onUploadStart,
  onUploadSuccess,
  onUploadError,
  onProgress,
}: UseFileUploadProps) {
  const transcribeMutation = useMutation({
    mutationFn: async (file: File): Promise<TranscriptionResponse> => {
      const formData = new FormData();
      formData.append('audioFile', file);

      const response = await fetch('/api/transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Erro ao processar arquivo');
      }

      return response.json();
    },
    onMutate: () => {
      onUploadStart();
      onProgress(10);
    },
    onSuccess: (data) => {
      onProgress(100);
      onUploadSuccess(data);
    },
    onError: (error) => {
      onProgress(0);
      onUploadError(error.message);
    },
  });

  const uploadFile = async (file: File) => {
    // Simulate progress for better UX
    let currentProgress = 10;
    const progressInterval = setInterval(() => {
      if (currentProgress >= 90) {
        clearInterval(progressInterval);
        return;
      }
      currentProgress += Math.random() * 10;
      onProgress(currentProgress);
    }, 200);

    try {
      await transcribeMutation.mutateAsync(file);
    } finally {
      clearInterval(progressInterval);
    }
  };

  return {
    uploadFile,
    isUploading: transcribeMutation.isPending,
  };
}
