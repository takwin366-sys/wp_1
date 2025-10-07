
export interface GeneratedContent {
  title: string;
  htmlBody: string;
  keywords: string;
  metaDescription: string;
  slug: string;
  category: string;
  tags: string;
}

export interface ImagePrompt {
  id: string;
  prompt: string;
  alt: string;
}

export interface StrategicKeyword {
  keyword: string;
  reason: string;
  title: string;
  thumbnailCopy: string;
  strategy: string;
}

export interface KeywordAnalysisResult {
  keyword: string;
  score: number;
  analysisTitle: string;
  analysisBody: string;
  expansionKeywords: string[];
}
