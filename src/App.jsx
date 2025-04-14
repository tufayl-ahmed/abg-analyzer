import React, { useState, useMemo } from 'react';
import './App.css'; // Keep for potential App-specific styles
import './index.css'; // Import global styles

// Placeholder imports - will create these files next
import Header from './components/Header';
import Footer from './components/Footer';
import Tabs from './components/Tabs';
import ManualInputForm from './components/ManualInputForm';
import FileUpload from './components/FileUpload'; // Import FileUpload
import ResultsDisplay from './components/ResultsDisplay'; // Import ResultsDisplay
import ABGAnalyzer from './utils/abgCalculator'; // Import the analyzer class

function App() {
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'upload'
  const [results, setResults] = useState(null); // Will store the full result object { step1: ..., state: ... }
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isResetting, setIsResetting] = useState(false); // State to trigger reset in children

  // Instantiate the analyzer. Use useMemo to avoid recreating it on every render.
  const abgAnalyzer = useMemo(() => new ABGAnalyzer(), []);

  // Function to handle analysis requests from child components
  const handleAnalysis = (inputValues) => {
    console.log("App: Received values for analysis:", inputValues);
    setIsLoading(true);
    setError(null);
    setResults(null); // Clear previous results

    // Perform analysis
    const analysisResult = abgAnalyzer.analyze(inputValues);
    console.log("App: Analysis result:", analysisResult);

    if (analysisResult.error) {
      handleError(analysisResult.error);
    } else {
      // Store the full result object AND the input values used for analysis
      setResults({ ...analysisResult, inputValues });
      setError(null);
    }
    setIsLoading(false);
  };

  const handleLoading = (loadingState) => {
    setIsLoading(loadingState);
    setError(null); // Clear error when loading starts
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
    setIsLoading(false);
    setResults(null); // Clear results on error
  };

  const handleReset = () => {
    console.log("App: Resetting analysis");
    setActiveTab('manual');
    setResults(null);
    setIsLoading(false);
    setError(null);
    // Trigger reset in child components
    setIsResetting(true);
    // Reset the trigger state after a short delay
    setTimeout(() => setIsResetting(false), 50);
  };

  return (
    <div className="container">
      <Header />

      <div className="main-content">
        <Tabs activeTab={activeTab} onTabChange={setActiveTab} />

        <div className="tab-content">
          {/* Analysis Section Wrapper */}
          <div className="analysis-section">
            {/* Input/Upload Column */}
            <div className="input-column">
              {activeTab === 'manual' && (
                <div id="manual" className="tab-pane active">
                  <ManualInputForm
                    onAnalyze={handleAnalysis}
                    onError={handleError}
                    isResetting={isResetting} // Pass reset trigger
                  />
                </div>
              )}
              {activeTab === 'upload' && (
                <div id="upload" className="tab-pane active">
                  <FileUpload
                    onAnalyze={handleAnalysis}
                    onError={handleError}
                    onLoading={handleLoading} // Pass handleLoading
                    isResetting={isResetting} // Pass reset trigger
                  />
                </div>
              )}
            </div>

            {/* Results Column - Render conditionally */}
            <div className="results-column">
              {isLoading && <p className="status-message">Loading analysis...</p>}
              {error && <p className="status-message error-message">Error: {error}</p>}
              {results && !isLoading && !error && (
                <ResultsDisplay results={results} onNewAnalysis={handleReset} />
              )}
              {!results && !isLoading && !error && (
                 <p className="status-message placeholder-message">Results will appear here.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <Footer />
    </div>
  );
}

export default App;
