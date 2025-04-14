import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPrint, faRedo, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

// Helper to generate print content (similar to the original UIController)
const generatePrintContent = (results) => {
    if (!results || !results.state) return '<p>No results available to print.</p>'; // Check for state too

    const inputValues = results.inputValues || {}; // Get input values if passed along with results
    const analysis = results; // The main results object

    const createRow = (label, value, unit = '', range = '') => {
        if (value === undefined || value === null || isNaN(value)) return ''; // Check if value is valid number
        return `<tr><td>${label}</td><td>${value}${unit ? ' ' + unit : ''}</td><td>${range}</td></tr>`;
    };

    // Refined Print Styles (copied from original ui-controller.js)
    return `
       <!DOCTYPE html>
       <html>
       <head>
           <title>ABG Analysis Report</title>
           <style>
               body { font-family: Arial, sans-serif; margin: 25px; line-height: 1.5; font-size: 11pt; }
               h1 { font-size: 16pt; text-align: center; margin-bottom: 15px; color: #1a3b5d; }
               h2 { font-size: 13pt; margin-top: 20px; margin-bottom: 10px; color: #007bff; border-bottom: 1px solid #eee; padding-bottom: 5px;}
               h3 { font-size: 12pt; color: #1a3b5d; margin-top: 15px; margin-bottom: 5px; }
               .section { margin-bottom: 20px; }
               table { border-collapse: collapse; width: 80%; margin-bottom: 15px; margin-left: auto; margin-right: auto; }
               th, td { border: 1px solid #ccc; padding: 6px 8px; text-align: left; font-size: 10pt;}
               th { background-color: #f2f2f2; font-weight: bold; }
               .interpretation-box { background-color: #e9ecef; padding: 12px; border-radius: 4px; border-left: 5px solid #1a3b5d; margin-top: 5px; }
               .interpretation-box p { font-size: 12pt; font-weight: bold; margin: 0; color: #1a3b5d; }
               .step { margin-bottom: 12px; }
               .step p { margin-left: 5px; font-size: 10.5pt; padding-left: 10px; border-left: 2px solid #eee; }
               .footer { margin-top: 40px; font-size: 9pt; color: #6c757d; text-align: center; border-top: 1px solid #ccc; padding-top: 10px; }
               @media print {
                   body { margin: 20px; } /* Adjust margins for printing */
                   .no-print { display: none; } /* Class for elements to hide during print */
                   a { text-decoration: none; color: inherit; } /* Avoid printing links underlined */
               }
           </style>
       </head>
       <body>
           <h1>Automatic ABG Analyzer Report</h1>

           ${Object.keys(inputValues).length > 0 ? `
           <div class="section">
               <h2>Input Values</h2>
               <table>
                   <thead><tr><th>Parameter</th><th>Value</th><th>Normal Range</th></tr></thead>
                   <tbody>
                       ${createRow('pH', inputValues.ph, '', '7.35-7.45')}
                       ${createRow('PaCO₂', inputValues.paco2, 'mmHg', '35-45')}
                       ${createRow('HCO₃⁻', inputValues.hco3, 'mmol/L', '22-26')}
                       ${createRow('PaO₂', inputValues.pao2, 'mmHg', '80-100')}
                       ${createRow('Na⁺', inputValues.na, 'mmol/L', '135-145')}
                       ${createRow('Cl⁻', inputValues.cl, 'mmol/L', '98-107')}
                       ${createRow('Base Excess', inputValues.be, 'mmol/L', '-2 to +2')}
                       ${createRow('SaO₂', inputValues.sao2, '%', '95-100')}
                       ${createRow('K⁺', inputValues.k, 'mmol/L', '3.5-5.0')}
                       ${createRow('Albumin', inputValues.albumin, 'g/dL', '3.5-5.0')}
                   </tbody>
               </table>
           </div>` : ''}

           <div class="section">
               <h2>Final Interpretation</h2>
               <div class="interpretation-box">
                   <p>${analysis.finalInterpretation || 'N/A'}</p>
               </div>
           </div>

           <div class="section">
               <h2>Step-by-Step Analysis (ATS Method)</h2>
               <div class="step"><h3>Step 1: Internal Consistency</h3><p>${analysis.step1 || 'N/A'}</p></div>
               <div class="step"><h3>Step 2: Acidemia/Alkalemia</h3><p>${analysis.step2 || 'N/A'}</p></div>
               <div class="step"><h3>Step 3: Primary Disorder</h3><p>${analysis.step3 || 'N/A'}</p></div>
               <div class="step"><h3>Step 4: Compensation</h3><p>${analysis.step4 || 'N/A'}</p></div>
               <div class="step"><h3>Step 5: Anion Gap</h3><p>${analysis.step5 || 'N/A'}</p></div>
               <div class="step"><h3>Step 6: Delta Ratio</h3><p>${analysis.step6 || 'N/A'}</p></div>
           </div>

           <div class="footer">
               Generated on: ${new Date().toLocaleString()} <br>
               Disclaimer: For educational purposes only. Not a substitute for clinical judgment.
           </div>
       </body>
       </html>
   `;
};


function ResultsDisplay({ results, onNewAnalysis }) {
  if (!results || results.error) {
    // Don't render anything if there are no results or if there was an error handled by App
    return null;
  }

  const { state, finalInterpretation, step1, step2, step3, step4, step5, step6 } = results;

  const handlePrint = () => {
    console.log("Print results requested.");
    // We need the input values here too for the print report.
    // Assuming App.jsx will pass the inputValues along with the analysis results.
    // If not, this needs adjustment. For now, assume `results` contains `inputValues`.
    const printContent = generatePrintContent(results);
    const printWindow = window.open('', 'Print Results', 'height=700,width=800');
    if (printWindow) {
        printWindow.document.write(printContent);
        printWindow.document.close();
        // Use timeout to ensure content is loaded before printing
        setTimeout(() => {
            printWindow.focus(); // Focus the new window
            printWindow.print();
            // printWindow.close(); // Optional: close window after print dialog
        }, 500);
    } else {
        alert("Could not open print window. Please check your browser's popup settings.");
    }
  };

  // Determine CSS classes for highlighting based on the analysis state
  const getStep2Class = () => {
    if (state?.acidBaseStatus === 'acidemia') return 'status-acidemia';
    if (state?.acidBaseStatus === 'alkalemia') return 'status-alkalemia';
    return '';
  };

  const getStep3Class = () => {
    return state?.primaryDisorder && !state.primaryDisorder.includes('mixed') && state.primaryDisorder !== 'normal' ? 'primary-disorder' : '';
  };


  return (
    <div id="results-section" className="results-section">
      <h2>ABG Analysis Results</h2>

      {/* Final Interpretation Summary */}
      <div className="result-summary">
        <div className="result-box">
          <h3>Final Interpretation</h3>
          <p id="final-interpretation" className="interpretation">{finalInterpretation || 'N/A'}</p>
        </div>
      </div>

      {/* Step-by-Step Breakdown */}
      <div className="detailed-results">
        <h3>Step-by-Step Analysis (ATS Method)</h3>
        <div className="step-container">
          <div className="step">
            <h4>Step 1: Check Internal Consistency</h4>
            <p id="step1-result">{step1 || 'N/A'}</p>
          </div>
          <div className="step">
            <h4>Step 2: Determine Acidemia or Alkalemia</h4>
            <p id="step2-result" className={getStep2Class()}>{step2 || 'N/A'}</p>
          </div>
          <div className="step">
            <h4>Step 3: Identify Primary Disorder</h4>
            <p id="step3-result" className={getStep3Class()}>{step3 || 'N/A'}</p>
          </div>
          <div className="step">
            <h4>Step 4: Evaluate Compensation</h4>
            <p id="step4-result">{step4 || 'N/A'}</p>
          </div>
          <div className="step">
            <h4>Step 5: Calculate Anion Gap <FontAwesomeIcon icon={faInfoCircle} className="info-icon" title="Anion Gap = Na⁺ - (Cl⁻ + HCO₃⁻). Normal ≈ 8-12 mmol/L. Corrected for low albumin if provided." /></h4>
            <p id="step5-result">{step5 || 'N/A'}</p>
          </div>
          <div className="step">
            <h4>Step 6: Evaluate ΔAG / ΔHCO₃⁻ <FontAwesomeIcon icon={faInfoCircle} className="info-icon" title="Delta Ratio = (AG - 12) / (24 - HCO₃⁻). Helps identify mixed disorders when AG is high. < 0.8 suggests added NAGMA, > 1.8 suggests added Metabolic Alkalosis." /></h4>
            <p id="step6-result">{step6 || 'N/A'}</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="action-buttons">
        <button id="print-results" className="btn btn-secondary action-btn" onClick={handlePrint}>
          <FontAwesomeIcon icon={faPrint} /> Print
        </button>
        <button id="new-analysis" className="btn btn-secondary action-btn" onClick={onNewAnalysis}>
          <FontAwesomeIcon icon={faRedo} /> New Analysis
        </button>
      </div>
    </div>
  );
}

export default ResultsDisplay;
