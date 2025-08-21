export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function isAudioFile(file: File): boolean {
  const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/mp4'];
  return allowedTypes.includes(file.type);
}

export function validateFileSize(file: File, maxSizeBytes: number = 10485760): boolean {
  return file.size <= maxSizeBytes;
}
