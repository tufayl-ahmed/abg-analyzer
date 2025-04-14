import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFileUpload, faCamera, faSpinner, faBrain } from '@fortawesome/free-solid-svg-icons';
// Import pdfjs library
import * as pdfjsLib from 'pdfjs-dist/build/pdf';

// Set worker source for PDF.js. Since vite-plugin-static-copy copies the worker
// to the root of the output directory, we can reference it directly by filename.
// This should be done once, ideally in main.jsx or App.jsx, but setting it here works too.
pdfjsLib.GlobalWorkerOptions.workerSrc = 'pdf.worker.mjs';

// Load API Key from environment variable
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const API_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

function FileUpload({ onAnalyze, onError, onLoading, isResetting }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [ocrResults, setOcrResults] = useState(null); // { ph: 7.4, ... }
  const [ocrError, setOcrError] = useState(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [pdfThumbnails, setPdfThumbnails] = useState([]);
  const [selectedPdfPage, setSelectedPdfPage] = useState(null);

  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null); // For snapshots and PDF rendering
  const pdfDocRef = useRef(null); // To store the loaded PDF document object
  const cameraStreamRef = useRef(null);

  // Effect to reset state when isResetting prop changes
  useEffect(() => {
    if (isResetting) {
      handleResetLocalState();
    }
  }, [isResetting]);

  const handleResetLocalState = () => {
    console.log("FileUpload: Resetting local state");
    setIsProcessing(false);
    setOcrResults(null);
    setOcrError(null);
    setLoadingMessage('');
    setIsDragging(false);
    setShowCamera(false);
    setPdfThumbnails([]);
    setSelectedPdfPage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (pdfDocRef.current) pdfDocRef.current = null;
    stopCameraStream();
  };

  // --- Drag and Drop Handlers ---
  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isProcessing) return;

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  }, [isProcessing]); // Add dependencies

  // --- File Input Handler ---
  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      processFile(files[0]);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  // --- File Processing Logic ---
  const processFile = (file) => {
    if (!file) return;
    console.log(`Processing file: ${file.name}, Type: ${file.type}`);
    handleResetLocalState(); // Reset before processing new file
    setIsProcessing(true);

    if (file.type.startsWith('image/')) {
      setLoadingMessage('Processing image...');
      processImage(file);
    } else if (file.type === 'application/pdf') {
      setLoadingMessage('Loading PDF...');
      processPDF(file);
    } else {
      onError('Unsupported file type. Please upload an image or PDF.');
      setIsProcessing(false);
    }
  };

  const processImage = (imageFile) => {
    const reader = new FileReader();
    reader.onload = (e) => callGeminiAPI(e.target.result); // Pass base64 string
    reader.onerror = () => {
      onError("Error reading image file.");
      setIsProcessing(false);
      setLoadingMessage('');
    };
    reader.readAsDataURL(imageFile);
  };

  const processPDF = async (pdfFile) => {
    setLoadingMessage("Loading PDF document...");
    const reader = new FileReader();

    reader.onload = async (e) => {
        const typedarray = new Uint8Array(e.target.result);
        try {
            // pdfjsLib.GlobalWorkerOptions.workerSrc is already set at the top level
            const pdfDoc = await pdfjsLib.getDocument({ data: typedarray }).promise;
            pdfDocRef.current = pdfDoc; // Store the document object
            console.log(`PDF loaded: ${pdfDoc.numPages} page(s).`);
            if (pdfDoc.numPages === 0) throw new Error("PDF has no pages.");

            // Start rendering thumbnails
            displayPdfThumbnails(); // Call the function to render thumbs

        } catch (error) {
            console.error("Error loading/parsing PDF:", error);
            onError(`Failed to load PDF: ${error.message}`);
            setIsProcessing(false);
            setLoadingMessage('');
            pdfDocRef.current = null; // Clear ref on error
        }
    };
    reader.onerror = (e) => {
         console.error("FileReader error:", e);
         onError("Error reading PDF file.");
         setIsProcessing(false);
         setLoadingMessage('');
    };
    reader.readAsArrayBuffer(pdfFile); // Read as ArrayBuffer for pdf.js
  };

  // --- Camera Logic ---
  const toggleCamera = async () => {
    if (showCamera && cameraStreamRef.current) {
        // Stop camera if it's already running
        stopCameraStream();
        setShowCamera(false);
        if (videoRef.current) {
            videoRef.current.onclick = null; // Remove snapshot trigger
        }
    } else {
        // Start camera
        console.log("Attempting to start camera...");
        if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                cameraStreamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    // Ensure video plays when stream is ready
                    videoRef.current.onloadedmetadata = () => {
                        videoRef.current.play();
                        console.log("Camera stream playing.");
                        // Add click listener to video for taking snapshot
                        videoRef.current.onclick = takeSnapshot;
                    };
                }
                setShowCamera(true);
                handleResetLocalState(); // Reset other inputs when camera starts
                setLoadingMessage(''); // Clear any previous loading messages
                setOcrError(null); // Clear any previous errors
            } catch (err) {
                console.error('Error accessing camera:', err);
                onError(`Could not access camera. Error: ${err.name}. Please ensure permission is granted.`);
                stopCameraStream(); // Ensure cleanup if error occurs during startup
                setShowCamera(false);
            }
        } else {
            onError('Your browser does not support camera access.');
            setShowCamera(false);
        }
    }
  };

  // --- PDF Thumbnail Generation ---
  const displayPdfThumbnails = async () => {
    if (!pdfDocRef.current) {
        onError("PDF document not loaded.");
        return;
    }
    const pdfDoc = pdfDocRef.current;
    const numPages = pdfDoc.numPages;
    const MAX_THUMBNAILS = 10; // Limit number of thumbnails for performance
    const pagesToRender = Math.min(numPages, MAX_THUMBNAILS);
    const thumbs = [];

    setLoadingMessage(`Rendering ${pagesToRender} PDF page thumbnails...`);
    setPdfThumbnails([]); // Clear previous thumbnails

    for (let pageNum = 1; pageNum <= pagesToRender; pageNum++) {
        try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2.0 }); // Further increased scale (was 2.5)
            const canvas = document.createElement('canvas'); // Offscreen canvas for thumbnail
            const context = canvas.getContext('2d');
            canvas.height = viewport.height;
            canvas.width = viewport.width;

            await page.render({ canvasContext: context, viewport: viewport }).promise;
            thumbs.push({ pageNum: pageNum, dataUrl: canvas.toDataURL() });

        } catch (error) {
            console.error(`Error rendering thumbnail for page ${pageNum}:`, error);
            // Continue rendering other thumbnails even if one fails
        }
    }

    setPdfThumbnails(thumbs);
    if (numPages > MAX_THUMBNAILS) {
        setLoadingMessage(`Showing first ${MAX_THUMBNAILS} pages. Select a page to analyze.`);
    } else {
        setLoadingMessage("Please select a page thumbnail to analyze.");
    }
    // Keep isProcessing true until a page is selected or reset
  };

  // --- PDF Page Selection & High-Res Render ---
  const handleThumbnailClick = async (pageNum) => {
    if (isProcessing && loadingMessage.includes('Analyzing')) {
        // Prevent clicking another thumbnail while Gemini is working
        alert("Analysis already in progress...");
        return;
    }
    if (!pdfDocRef.current) {
        onError("PDF document not loaded.");
        return;
    }

    console.log(`Thumbnail clicked for page ${pageNum}`);
    setSelectedPdfPage(pageNum);
    setIsProcessing(true); // Ensure processing state is active
    setLoadingMessage(`Rendering page ${pageNum} for analysis...`);
    setOcrResults(null); // Clear previous OCR results
    setOcrError(null);

    try {
        const page = await pdfDocRef.current.getPage(pageNum);
        const scale = 2.0; // Higher resolution for OCR
        const viewport = page.getViewport({ scale: scale });
        const canvas = canvasRef.current; // Use the main canvas element
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({ canvasContext: context, viewport: viewport }).promise;
        console.log(`Page ${pageNum} rendered to main canvas for OCR.`);

        const imageDataUrl = canvas.toDataURL('image/png'); // Use PNG for potentially better quality
        callGeminiAPI(imageDataUrl); // Send high-res image to Gemini

    } catch (error) {
        console.error(`Error rendering page ${pageNum} for analysis:`, error);
        onError(`Failed to render page ${pageNum}: ${error.message}`);
        setIsProcessing(false);
        setLoadingMessage('');
        setSelectedPdfPage(null);
    }
  };


  const takeSnapshot = () => {
    if (isProcessing || !videoRef.current || !canvasRef.current || !cameraStreamRef.current) {
        console.warn("Cannot take snapshot: Not ready or already processing.");
        return;
    }
    console.log("Taking snapshot...");
    setIsProcessing(true); // Set processing state
    setLoadingMessage("Processing snapshot...");
    setOcrResults(null); // Clear previous results
    setOcrError(null);
    setPdfThumbnails([]); // Clear PDF thumbs if shown

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    // Set canvas dimensions to video dimensions
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the current video frame onto the canvas
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get the image data from the canvas
    const base64ImageData = canvas.toDataURL('image/jpeg'); // Use JPEG for snapshots

    // Stop the camera stream after taking the snapshot
    stopCameraStream();
    setShowCamera(false);
    if (videoRef.current) {
        videoRef.current.onclick = null; // Remove snapshot trigger
    }


    console.log("Snapshot taken, sending to Gemini...");
    callGeminiAPI(base64ImageData); // Send snapshot data for analysis
  };

  const stopCameraStream = () => {
    if (cameraStreamRef.current) {
      cameraStreamRef.current.getTracks().forEach(track => track.stop());
      cameraStreamRef.current = null;
      console.log("Camera stream stopped.");
    }
  };

  // --- Paste Logic ---
  useEffect(() => {
    const handlePasteEvent = (event) => {
      console.log("Paste event detected.");
      if (isProcessing) {
        console.log("Ignoring paste event, processing already in progress.");
        return;
      }
      const items = event.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            console.log("Image pasted from clipboard.");
            event.preventDefault();
            handleResetLocalState(); // Reset before processing
            setIsProcessing(true);
            setLoadingMessage('Processing pasted image...');
            processImage(blob); // Use processImage which reads as base64
            break;
          }
        }
      }
    };

    document.addEventListener('paste', handlePasteEvent);
    return () => {
      document.removeEventListener('paste', handlePasteEvent); // Cleanup listener
    };
  }, [isProcessing]); // Re-attach listener if isProcessing changes

  // --- Gemini API Call ---
  const callGeminiAPI = async (base64ImageDataWithPrefix) => {
    setLoadingMessage('Analyzing image with Gemini...');
    setOcrError(null);
    setOcrResults(null);

    if (!GEMINI_API_KEY || GEMINI_API_KEY === 'YOUR_API_KEY_HERE') {
        onError("Gemini API Key not configured. Please set VITE_GEMINI_API_KEY in your .env file.");
        setIsProcessing(false);
        setLoadingMessage('');
        return;
    }

    if (!base64ImageDataWithPrefix || !base64ImageDataWithPrefix.startsWith('data:image')) {
        console.error("Invalid base64 image data provided to callGeminiAPI.");
        onError("Invalid image data format for API call.");
        setIsProcessing(false);
        setLoadingMessage('');
        return;
    }

    const mimeMatch = base64ImageDataWithPrefix.match(/^data:(image\/\w+);base64,/);
    if (!mimeMatch || mimeMatch.length < 2) {
        console.error("Could not extract mime type from base64 string.");
        onError("Could not determine image type.");
        setIsProcessing(false);
        setLoadingMessage('');
        return;
    }
    const mimeType = mimeMatch[1];
    const base64Data = base64ImageDataWithPrefix.replace(/^data:image\/\w+;base64,/, '');

    const prompt = `Analyze the provided image which contains Arterial Blood Gas (ABG) results. Extract the following values if present: pH, PaCO2, PaO2, HCO3, Base Excess (BE), SaO2, Sodium (Na), Chloride (Cl), Potassium (K), Albumin. Return the extracted values ONLY as a valid JSON object. Use these exact keys: 'ph', 'paco2', 'pao2', 'hco3', 'be', 'sao2', 'na', 'cl', 'k', 'albumin'. If a value is not found or clearly identifiable, omit its key from the JSON object. Ensure the output is strictly JSON.`;

    const requestBody = {
        contents: [{ parts: [ { "text": prompt }, { "inline_data": { "mime_type": mimeType, "data": base64Data } } ] }],
        generationConfig: { "response_mime_type": "application/json" }
    };

    console.log("Sending request to Gemini endpoint...");

    try {
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        console.log(`Gemini API Raw Response Status: ${response.status}, Status Text: ${response.statusText}`);

        if (!response.ok) {
            let errorBodyText = "Could not read error response body.";
            try {
                errorBodyText = await response.text();
                console.error('Gemini API Error Response Text:', errorBodyText);
                const errorBodyJson = JSON.parse(errorBodyText);
                const errorMessage = errorBodyJson?.error?.message || response.statusText || "Unknown API error";
                throw new Error(`API Error ${response.status}: ${errorMessage}`);
            } catch (parseError) {
                 // If parsing fails, use the raw text or status text
                 throw new Error(`API Error ${response.status}: ${errorBodyText || response.statusText}`);
            }
        }

        const result = await response.json();
        console.log('Gemini API Parsed Success Response:', result);

        // Navigate the response structure safely
        const part = result?.candidates?.[0]?.content?.parts?.[0];
        if (part && part.text) {
            let parsedValues = {};
            try {
                // Clean potential markdown fences if response_mime_type wasn't fully respected
                const cleanedString = part.text.replace(/^```json\s*|```$/g, '').trim();
                parsedValues = JSON.parse(cleanedString);
                console.log("Parsed Values from Gemini:", parsedValues);
                const sanitizedValues = sanitizeParsedValues(parsedValues);
                setOcrResults(sanitizedValues);
                if (Object.keys(sanitizedValues).length === 0) {
                    setOcrError("Gemini found no values in the image.");
                } else {
                    setOcrError(null);
                }
            } catch (e) {
                console.error("Failed to parse JSON from Gemini text response:", e, "Response text:", part.text);
                throw new Error("Gemini response was not valid JSON.");
            }
        } else {
             console.warn("Gemini returned success, but no valid content part found in response structure:", result);
            throw new Error('No valid content returned from Gemini.');
        }

    } catch (error) {
        console.error('Error during Gemini API call or processing:', error);
        setOcrError(`Gemini API Request Failed: ${error.message}`);
        setOcrResults(null); // Clear any previous results on error
    } finally {
        setIsProcessing(false);
        setLoadingMessage('');
        console.log("Gemini processing finished.");
    }
  };

  // --- OCR Results Handling ---
  const handleOcrValueChange = (key, value) => {
    const numericValue = value === '' ? '' : parseFloat(value);
    setOcrResults(prev => ({
      ...prev,
      [key]: isNaN(numericValue) ? '' : numericValue // Store numeric or empty string
    }));
  };

  // Helper to sanitize values from Gemini (ensure they are numbers or empty string)
  const sanitizeParsedValues = (parsedValues) => {
    const sanitized = {};
    if (!parsedValues || typeof parsedValues !== 'object') return sanitized;
    for (const key in parsedValues) {
        const value = parsedValues[key];
        if (value !== null && value !== undefined) {
            const numValue = parseFloat(String(value).replace(/[^0-9.-]+/g,"")); // Attempt to clean and parse
            if (!isNaN(numValue)) {
                sanitized[key] = numValue;
            } else {
                console.warn(`Gemini returned non-numeric or unparseable value for ${key}: ${value}`);
                // Optionally keep the original string or set to empty/null based on desired behavior
                // sanitized[key] = ''; // Example: Set to empty string if unparseable
            }
        }
    }
    return sanitized;
  };


  const handleProcessOcr = () => {
    if (!ocrResults) {
        onError("No OCR results to process.");
        return;
    }
    // Filter out non-numeric or empty values before sending to analysis
    const valuesToAnalyze = Object.entries(ocrResults).reduce((acc, [key, value]) => {
        if (value !== '' && !isNaN(value)) {
            acc[key] = value;
        }
        return acc;
    }, {});

    console.log("Submitting OCR results for analysis:", valuesToAnalyze);
    // Check for required fields after filtering
    const requiredFields = ['ph', 'paco2', 'hco3'];
    const missingRequired = requiredFields.filter(key => valuesToAnalyze[key] === undefined);
    if (missingRequired.length > 0) {
        onError(`Analysis requires at least pH, PaCO₂, and HCO₃⁻ values from OCR. Missing: ${missingRequired.join(', ')}`);
        return;
    }

    onAnalyze(valuesToAnalyze);
  };

  // --- Helper to format names ---
  const formatParameterName = (key) => {
    const nameMap = {
        ph: 'pH', paco2: 'PaCO₂', pao2: 'PaO₂', hco3: 'HCO₃⁻', be: 'Base Excess',
        sao2: 'SaO₂', na: 'Na⁺', cl: 'Cl⁻', k: 'K⁺', albumin: 'Albumin'
    };
    return nameMap[key] || key.toUpperCase();
  };


  return (
    <div className="upload-container">
      {/* Wrapper for Input Elements */}
      <div className="upload-input-area">
        {/* Drag & Drop / Click Upload Area */}
        <div
          className={`upload-box ${isDragging ? 'highlight' : ''}`}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={triggerFileInput}
        role="button"
        tabIndex={0}
        aria-label="Upload image or PDF file"
      >
        <FontAwesomeIcon icon={faFileUpload} />
        <p>Drag & Drop image or PDF here or click to upload</p>
        <input
          type="file"
          id="file-input"
          ref={fileInputRef}
          accept="image/*,.pdf"
          hidden
          onChange={handleFileChange}
        />
      </div>

      {/* Camera Button & Preview */}
      <button onClick={toggleCamera} className="btn btn-secondary camera-btn" disabled={isProcessing}>
        <FontAwesomeIcon icon={faCamera} /> {showCamera ? 'Stop Camera' : 'Take Photo'}
      </button>
      {showCamera && (
        <video id="camera-preview" ref={videoRef} hidden={!showCamera} playsInline autoPlay muted></video>
        // Snapshot button could be added here or triggered differently
      )}
      <canvas id="snapshot-canvas" ref={canvasRef} hidden></canvas>

      {/* PDF Preview Area - TODO */}
      {/* PDF Preview Area */}
      {pdfThumbnails.length > 0 && !ocrResults && !ocrError && ( // Show only when thumbnails are ready and no OCR result/error
         <div id="pdf-preview-area">
            <p>{loadingMessage.includes('Rendering') ? loadingMessage : 'Select the page containing ABG results:'}</p>
            <div id="pdf-thumbnail-container" className="pdf-thumbnails">
                {pdfThumbnails.map(thumb => (
                    <div
                        key={thumb.pageNum}
                        className={`pdf-thumbnail ${selectedPdfPage === thumb.pageNum ? 'selected' : ''}`}
                        onClick={() => handleThumbnailClick(thumb.pageNum)}
                        role="button"
                        tabIndex={0}
                        aria-label={`Select PDF page ${thumb.pageNum}`}
                    >
                        <img src={thumb.dataUrl} alt={`Page ${thumb.pageNum} thumbnail`} />
                        <span>Page {thumb.pageNum}</span>
                    </div>
                ))}
                {pdfDocRef.current && pdfDocRef.current.numPages > pdfThumbnails.length && (
                    <p style={{ width: '100%', textAlign: 'center', fontSize: 'var(--font-size-sm)', color: 'var(--text-muted)' }}>
                        Showing first {pdfThumbnails.length} pages.
                    </p>
                )}
            </div>
         </div>
        )}
      </div> {/* End of upload-input-area */}

      {/* Loading/Processing Indicator */}
      {isProcessing && loadingMessage && (
        <div className="loading">
          <FontAwesomeIcon icon={faSpinner} spin /> {loadingMessage}
        </div>
      )}

      {/* OCR Error Display */}
      {ocrError && !isProcessing && (
          <div className="error-message">{ocrError}</div>
      )}


      {/* OCR Results Display Area */}
      {ocrResults && !isProcessing && !ocrError && (
        <div className="ocr-results">
          <h3>Extracted Values (Editable)</h3>
          <div className="ocr-data-container">
            <table className="ocr-table">
              <thead>
                <tr><th>Parameter</th><th>Value</th><th>Source</th></tr>
              </thead>
              <tbody>
                {Object.entries(ocrResults).map(([key, value]) => (
                  <tr key={key}>
                    <td>{formatParameterName(key)}</td>
                    <td>
                      <input
                        type="number"
                        id={`ocr-${key}`}
                        value={value}
                        onChange={(e) => handleOcrValueChange(key, e.target.value)}
                        step="0.01" // Adjust step based on parameter if needed
                        className="ocr-value-input"
                      />
                    </td>
                    <td><FontAwesomeIcon icon={faBrain} className="success-icon" title="Extracted by Gemini" /> Gemini</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button onClick={handleProcessOcr} className="btn btn-primary analyze-btn" disabled={isProcessing}>
            Verify & Analyze
          </button>
        </div>
      )}
    </div>
  );
}

export default FileUpload;
