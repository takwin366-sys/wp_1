
import React, { useState, useCallback, useEffect } from 'react';
import { Header } from './components/Header';
import { Controls } from './components/Controls';
import { LoadingSpinner } from './components/LoadingSpinner';
import { GeneratedPost } from './components/GeneratedPost';
import { ErrorDisplay } from './components/ErrorDisplay';
import { generateBlogPost, generateImage, generateStrategicKeywords, analyzeKeyword } from './services/geminiService';
import type { GeneratedContent, ImagePrompt, StrategicKeyword, KeywordAnalysisResult } from './types';
import { Welcome } from './components/Welcome';
import { ImagePromptsDisplay } from './components/ImagePromptsDisplay';
import { WordPressSettings } from './components/WordPressSettings';
import { StrategicKeywords } from './components/StrategicKeywords';
import { KeywordAnalysis } from './components/KeywordAnalysis';
import { ApiKeyModal } from './components/ApiKeyModal';

const usePersistentState = (key: string, defaultValue: string) => {
    const [state, setState] = useState(() => {
        try {
            const storedValue = localStorage.getItem(key);
            return storedValue !== null ? storedValue : defaultValue;
        } catch {
            return defaultValue;
        }
    });
    useEffect(() => {
        try {
            localStorage.setItem(key, state);
        } catch (error) {
            console.error("Could not save to localStorage", error);
        }
    }, [key, state]);
    return [state, setState] as const;
};


function App() {
  const [keyword, setKeyword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imageModel, setImageModel] = useState<'gemini' | 'dalle'>('gemini');
  const [imagePrompts, setImagePrompts] = useState<ImagePrompt[]>([]);
  const [isBatchGenerating, setIsBatchGenerating] = useState<boolean>(false);
  
  const [siteUrl, setSiteUrl] = usePersistentState('wpSiteUrl', '');
  const [username, setUsername] = usePersistentState('wpUsername', '');
  const [appPassword, setAppPassword] = usePersistentState('wpAppPassword', '');
  const [dalleApiKey, setDalleApiKey] = usePersistentState('dalleApiKey', '');
  const [userGeminiApiKey, setUserGeminiApiKey] = usePersistentState('userGeminiApiKey', '');
  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false);

  const [strategicKeywords, setStrategicKeywords] = useState<StrategicKeyword[] | null>(null);
  const [isStrategicLoading, setIsStrategicLoading] = useState<boolean>(false);
  const [strategicError, setStrategicError] = useState<string | null>(null);

  const [analysisResult, setAnalysisResult] = useState<KeywordAnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const isApiKeySet = !!userGeminiApiKey && userGeminiApiKey.trim() !== '';

  useEffect(() => {
    // On initial load, check if a key exists. If not, force the modal open.
    const key = localStorage.getItem('userGeminiApiKey');
    if (!key || key.trim() === '') {
      setIsApiKeyModalOpen(true);
    }
  }, []);


  const processInlineImages = useCallback(async (htmlBody: string) => {
    let processedHtml = htmlBody;
    const inlinePromptRegex = /<!-- IMG_PROMPT: (.*?) \|\| ALT: (.*?) -->/g;
    
    const prompts: ImagePrompt[] = [];
    let tempHtml = processedHtml;

    let inlineIndex = 0;
    tempHtml = tempHtml.replace(inlinePromptRegex, (_match, prompt, alt) => {
        const id = `inline-${inlineIndex}`;
        prompts.push({ id, prompt, alt });
        inlineIndex++;
        return `<!-- IMAGE_PLACEHOLDER_${id} -->`;
    });

    setImagePrompts(prompts);
    
    setGeneratedContent(prev => prev ? { ...prev, htmlBody: tempHtml.trim() } : null);
    
  }, []);

  const handleBatchGenerate = useCallback(async () => {
    if (imagePrompts.length === 0 || !generatedContent) return;

    if (imageModel === 'dalle' && !dalleApiKey.trim()) {
        setError("DALL-E API 키를 입력하고 다시 시도해주세요.");
        return;
    }
    setError(null);

    setIsBatchGenerating(true);
    let currentHtml = generatedContent.htmlBody;
    const failedPrompts: ImagePrompt[] = [];
    let successfulGenerations = 0;

    for (const p of imagePrompts) {
        try {
            const imageUrl = await generateImage(p.prompt, imageModel, imageModel === 'dalle' ? dalleApiKey : undefined);
            if (imageUrl) {
                const maxWidth = '100%';
                const marginBottom = '30px';
                const imageHtml = `<p style="text-align: center;"><img src="${imageUrl}" alt="${p.alt}" style="width: 100%; max-width: ${maxWidth}; margin: 0 auto ${marginBottom}; display: block; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" /></p>`;
                
                const placeholder = `<!-- IMAGE_PLACEHOLDER_${p.id} -->`;
                currentHtml = currentHtml.replace(placeholder, imageHtml);
                successfulGenerations++;
                
                setGeneratedContent(prev => ({ ...prev!, htmlBody: currentHtml }));
            } else {
               failedPrompts.push(p);
            }
        } catch (imgErr) {
            console.error(`Failed to generate image for prompt: "${p.prompt}"`, imgErr);
            failedPrompts.push(p);
        }
    }
    
    if (failedPrompts.length > 0) {
        const failedCount = imagePrompts.length - successfulGenerations;
        setError(`이미지 ${failedCount}개 생성에 실패했습니다. 안전 정책 위반 등의 이유일 수 있습니다. 프롬프트 내용을 확인 후 다시 시도해 주세요.`);
    }

    setImagePrompts(failedPrompts);
    setIsBatchGenerating(false);

  }, [imagePrompts, generatedContent, imageModel, dalleApiKey]);


  const handleGenerate = useCallback(async () => {
    if (!keyword.trim()) {
      setError('Please enter a keyword or topic.');
      return;
    }
    if (imageModel === 'dalle' && !dalleApiKey.trim()) {
        setError("DALL-E API 키를 입력해주세요.");
        return;
    }

    setAnalysisResult(null);
    setAnalysisError(null);
    setIsLoading(true);
    setError(null);
    setGeneratedContent(null);
    setImagePrompts([]);

    try {
      const postContent = await generateBlogPost(keyword);
      setGeneratedContent(postContent);

      await processInlineImages(postContent.htmlBody);

    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [keyword, imageModel, processInlineImages, dalleApiKey]);

  const handleAnalyzeKeyword = useCallback(async () => {
    if (!keyword.trim()) {
        setAnalysisError('분석할 키워드를 입력해주세요.');
        return;
    }
    setIsAnalyzing(true);
    setAnalysisError(null);
    setAnalysisResult(null);
    setError(null);

    try {
        const result = await analyzeKeyword(keyword);
        setAnalysisResult(result);
    } catch (err) {
        console.error(err);
        setAnalysisError(err instanceof Error ? err.message : '키워드 분석 중 오류가 발생했습니다.');
    } finally {
        setIsAnalyzing(false);
    }
  }, [keyword]);


  const handleGenerateStrategicKeywords = useCallback(async () => {
    setIsStrategicLoading(true);
    setStrategicError(null);
    setStrategicKeywords(null);
    try {
      const keywords = await generateStrategicKeywords();
      setStrategicKeywords(keywords);
    } catch (err) {
      console.error(err);
      setStrategicError(err instanceof Error ? err.message : 'An unknown error occurred while generating strategic keywords.');
    } finally {
      setIsStrategicLoading(false);
    }
  }, []);

  const handleKeywordSelect = (selectedKeyword: string) => {
    setKeyword(selectedKeyword);
    setAnalysisResult(null);
    setAnalysisError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  
  const handleModalClose = () => {
    // Only allow closing the modal if an API key is already set.
    if (userGeminiApiKey && userGeminiApiKey.trim() !== '') {
      setIsApiKeyModalOpen(false);
    }
  };

  const handleModalSave = (newKey: string) => {
    setUserGeminiApiKey(newKey);
    setIsApiKeyModalOpen(false);
  };

  const handleModalReset = () => {
    // Clear the key but keep the modal open to force entering a new one.
    setUserGeminiApiKey('');
    setIsApiKeyModalOpen(true);
  };


  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-200 transition-colors duration-300">
      <Header onOpenApiKeyModal={() => setIsApiKeyModalOpen(true)} />
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
            <WordPressSettings
                siteUrl={siteUrl}
                setSiteUrl={setSiteUrl}
                username={username}
                setUsername={setUsername}
                appPassword={appPassword}
                setAppPassword={setAppPassword}
                isLoading={isLoading || isAnalyzing}
            />
            
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg p-6 sm:p-8 space-y-6">
              <Controls
                  keyword={keyword}
                  setKeyword={setKeyword}
                  onGenerate={handleGenerate}
                  isLoading={isLoading}
                  imageModel={imageModel}
                  setImageModel={setImageModel}
                  dalleApiKey={dalleApiKey}
                  setDalleApiKey={setDalleApiKey}
                  onAnalyze={handleAnalyzeKeyword}
                  isAnalyzing={isAnalyzing}
                  isApiKeySet={isApiKeySet}
              />
               {isLoading && (
                <div className="flex flex-col items-center justify-center py-10">
                    <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent border-solid rounded-full animate-spin"></div>
                    <p className="mt-4 text-md font-semibold text-gray-700 dark:text-gray-300">블로그 포스트를 생성하고 있습니다...</p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">잠시만 기다려 주세요.</p>
                </div>
              )}
              {error && !isBatchGenerating && <ErrorDisplay message={error} />}
              {analysisError && <ErrorDisplay message={analysisError} />}
              {isAnalyzing && (
                  <div className="flex items-center justify-center p-4 text-sm text-teal-800 rounded-lg bg-teal-50 dark:bg-gray-800 dark:text-teal-400" role="status">
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>키워드를 분석하고 있습니다...</span>
                  </div>
              )}
              {analysisResult && <KeywordAnalysis analysis={analysisResult} onKeywordSelect={handleKeywordSelect} />}
            </div>

            <StrategicKeywords 
                onGenerate={handleGenerateStrategicKeywords}
                keywords={strategicKeywords}
                isLoading={isStrategicLoading}
                error={strategicError}
                onKeywordSelect={handleKeywordSelect}
                isApiKeySet={isApiKeySet}
            />
        </div>

        <div className="mt-10 max-w-4xl mx-auto">
          {isBatchGenerating && (
             <div className="flex items-center justify-center p-4 mb-4 text-sm text-blue-800 rounded-lg bg-blue-50 dark:bg-gray-800 dark:text-blue-400" role="status">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>이미지를 생성하고 있습니다... ({imagePrompts.length}개 남음)</span>
            </div>
          )}
          {error && isBatchGenerating && <div className="mt-4"><ErrorDisplay message={error}/></div>}
          
          {!isLoading && imagePrompts.length > 0 && (
            <div className="my-10">
              <ImagePromptsDisplay 
                prompts={imagePrompts} 
                onBatchGenerate={handleBatchGenerate}
                isGenerating={isBatchGenerating}
                model={imageModel}
              />
            </div>
          )}
          
          {generatedContent ? (
            <GeneratedPost 
              content={generatedContent}
              wpSiteUrl={siteUrl}
              wpUsername={username}
              wpAppPassword={appPassword}
            />
          ) : (
            !isLoading && !error && !strategicKeywords && <Welcome />
          )}
        </div>
      </main>
      <ApiKeyModal
        isOpen={isApiKeyModalOpen}
        onClose={handleModalClose}
        currentApiKey={userGeminiApiKey}
        onSave={handleModalSave}
        onReset={handleModalReset}
        isDismissable={isApiKeySet}
      />
       <footer className="text-center py-6 text-sm text-gray-500 dark:text-gray-400">
        <p>Powered by React, Tailwind CSS, and Gemini API</p>
      </footer>
    </div>
  );
}

export default App;
