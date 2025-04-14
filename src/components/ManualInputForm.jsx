import React, { useState, useEffect } from 'react';

// Define physiological ranges for input validation feedback
const physiologicalRanges = {
  ph: { min: 6.0, max: 8.0, step: 0.01, placeholder: 'e.g., 7.40', label: 'pH', unit: '', normal: '7.35-7.45' },
  paco2: { min: 10, max: 200, step: 0.1, placeholder: 'e.g., 40', label: 'PaCO₂', unit: 'mmHg', normal: '35-45' },
  hco3: { min: 2, max: 60, step: 0.1, placeholder: 'e.g., 24', label: 'HCO₃⁻', unit: 'mmol/L', normal: '22-26' },
  pao2: { min: 10, max: 700, step: 0.1, placeholder: 'e.g., 90', label: 'PaO₂', unit: 'mmHg', normal: '80-100' },
  na: { min: 90, max: 180, step: 0.1, placeholder: 'e.g., 140', label: 'Na⁺', unit: 'mmol/L', normal: '135-145' },
  cl: { min: 70, max: 130, step: 0.1, placeholder: 'e.g., 102', label: 'Cl⁻', unit: 'mmol/L', normal: '98-107' },
  be: { min: -30, max: 30, step: 0.1, placeholder: 'e.g., 0', label: 'Base Excess', unit: 'mmol/L', normal: '-2 to +2' },
  sao2: { min: 0, max: 100, step: 0.1, placeholder: 'e.g., 97', label: 'SaO₂', unit: '%', normal: '95-100' },
  k: { min: 2.0, max: 7.0, step: 0.1, placeholder: 'e.g., 4.0', label: 'K⁺ (Optional)', unit: 'mmol/L', normal: '3.5-5.0' },
  albumin: { min: 1.0, max: 6.0, step: 0.1, placeholder: 'e.g., 4.0', label: 'Albumin (Optional)', unit: 'g/dL', normal: '3.5-5.0' }
};

const initialFormState = Object.keys(physiologicalRanges).reduce((acc, key) => {
  acc[key] = '';
  return acc;
}, {});

function ManualInputForm({ onAnalyze, onLoading, onError, isResetting }) {
  const [formValues, setFormValues] = useState(initialFormState);
  const [errors, setErrors] = useState({});

  // Effect to reset form when isResetting prop changes (triggered by App's handleReset)
  useEffect(() => {
    if (isResetting) {
      handleClearForm();
    }
  }, [isResetting]);


  const validateInput = (name, value) => {
    const range = physiologicalRanges[name];
    if (value === '' || value === undefined || value === null) {
      return ''; // No error if empty
    }
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      return 'Must be a number.';
    }
    if (range && (numericValue < range.min || numericValue > range.max)) {
      return `Outside range (${range.min}-${range.max})`;
    }
    return ''; // No error
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormValues(prev => ({ ...prev, [name]: value }));
    setErrors(prev => ({ ...prev, [name]: validateInput(name, value) }));
  };

  const handleClearForm = () => {
    setFormValues(initialFormState);
    setErrors({});
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    let formIsValid = true;
    const currentErrors = {};
    const valuesToAnalyze = {};

    // Validate all fields on submit
    for (const key in physiologicalRanges) {
      const value = formValues[key];
      const error = validateInput(key, value);
      if (error) {
        currentErrors[key] = error;
        formIsValid = false;
      }
      // Collect valid numeric values for analysis
      if (value !== '' && !isNaN(parseFloat(value)) && !error) {
        valuesToAnalyze[key] = parseFloat(value);
      }
    }

    setErrors(currentErrors);

    if (!formIsValid) {
      onError("Please correct the highlighted invalid input values.");
      return;
    }

    // Check if required fields have values
    const requiredFields = ['ph', 'paco2', 'hco3'];
    const missingRequired = requiredFields.filter(key => valuesToAnalyze[key] === undefined);

    if (missingRequired.length > 0) {
        onError(`Analysis requires at least pH, PaCO₂, and HCO₃⁻ values. Missing: ${missingRequired.join(', ')}`);
        return;
    }

    console.log("Submitting manual form values:", valuesToAnalyze);
    // Pass values up to App component for analysis
    // onLoading(true); // App will handle loading state
    onAnalyze(valuesToAnalyze); // Pass the cleaned numeric values
  };

  return (
    <form id="abg-form" onSubmit={handleSubmit}>
      <div className="form-grid">
        {Object.entries(physiologicalRanges).map(([key, config]) => (
          <div className="form-group" key={key}>
            <label htmlFor={key}>{config.label}</label>
            <input
              type="number"
              id={key}
              name={key}
              step={config.step}
              placeholder={config.placeholder}
              value={formValues[key]}
              onChange={handleChange}
              className={errors[key] ? 'input-invalid' : ''}
              aria-describedby={`${key}-error ${key}-range`} // For accessibility
              aria-invalid={!!errors[key]}
            />
            <span id={`${key}-range`} className="normal-range">Normal: {config.normal} {config.unit}</span>
            {errors[key] && <span id={`${key}-error`} className="error-message">{errors[key]}</span>}
          </div>
       ))}
      </div>
      <div className="form-actions">
        <button type="button" onClick={handleClearForm} className="btn btn-secondary clear-btn">Clear Form</button>
        <button type="submit" className="btn btn-primary analyze-btn">Analyze ABG</button>
      </div>
    </form>
  );
}

export default ManualInputForm;
