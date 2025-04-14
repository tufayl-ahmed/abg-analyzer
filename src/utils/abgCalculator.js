/**
 * ABG Analyzer - Core Analysis Logic
 * Implements the ATS Six-Step approach for ABG interpretation.
 * Adapted for use as an ES module.
 */

class ABGAnalyzer {
    constructor() {
        // Store results for each step and final interpretation
        this.results = {};
        // Store intermediate calculation states
        this.state = {};
    }

    /**
     * Perform full ABG analysis using the ATS Six-Step Method.
     * @param {Object} values - Object containing ABG values (ph, paco2, hco3 required; na, cl, albumin optional).
     * @returns {Object} Analysis results including step-by-step breakdown, final interpretation, and the internal state used for highlighting/logic.
     */
    analyze(values) {
        this.resetStateAndResults();

        // --- Input Validation ---
        if (!this.validateInputs(values)) {
            // Return error and the (empty) state
            return { ...this.results, state: this.state };
        }

        // --- ATS Six-Step Analysis ---
        try {
            // Step 1: Check internal consistency (Henderson-Hasselbalch)
            this.results.step1 = this.checkInternalConsistency(values.ph, values.paco2, values.hco3);

            // Step 2: Determine acidemia or alkalemia
            this.results.step2 = this.determineAcidemiaAlkalemia(values.ph);

            // Step 3: Identify primary disorder
            this.results.step3 = this.identifyPrimaryDisorder(values.ph, values.paco2, values.hco3);

            // Step 4: Evaluate compensation
            this.results.step4 = this.evaluateCompensation(values.paco2, values.hco3);

            // Step 5: Calculate Anion Gap (if electrolytes provided)
            if (values.na !== undefined && values.cl !== undefined && values.hco3 !== undefined) {
                this.results.step5 = this.calculateAnionGap(values.na, values.cl, values.hco3, values.albumin);
            } else {
                this.results.step5 = "Skipped: Na⁺ and Cl⁻ values required for Anion Gap calculation.";
                this.state.anionGap = null; // Ensure AG state is null
            }

            // Step 6: Evaluate Delta Ratio (if HAGMA is present)
            const agToCheck = this.state.correctedAnionGap ?? this.state.anionGap; // Use corrected AG if available
            if (agToCheck !== null && agToCheck > 12 && this.state.primaryDisorder === 'metabolic acidosis') {
                 this.results.step6 = this.evaluateDeltaRatio(agToCheck, values.hco3);
            } else if (agToCheck !== null && agToCheck <= 12 && this.state.primaryDisorder === 'metabolic acidosis') {
                 this.results.step6 = "Not Applicable: Anion gap is not elevated.";
            } else if (this.state.primaryDisorder !== 'metabolic acidosis') {
                 this.results.step6 = "Not Applicable: Primary disorder is not metabolic acidosis.";
            } else {
                 this.results.step6 = "Skipped: Anion gap calculation was skipped or failed.";
            }

            // --- Final Interpretation ---
            this.results.finalInterpretation = this.generateFinalInterpretation();

        } catch (error) {
            console.error("Error during ABG analysis:", error);
            this.results.error = `Analysis Error: ${error.message}`;
            // Ensure partial results are cleared if a major error occurs
            this.results.finalInterpretation = "Analysis incomplete due to error.";
        }

        // Return both results and the final state
        return { ...this.results, state: this.state };
    }

    /**
     * Reset internal state and results for a new analysis.
     */
    resetStateAndResults() {
        this.results = {
            step1: '', step2: '', step3: '', step4: '', step5: '', step6: '',
            finalInterpretation: '', error: null
        };
        this.state = {
            acidBaseStatus: null, // 'acidemia', 'alkalemia', 'normal'
            primaryDisorder: null, // 'metabolic acidosis', 'respiratory acidosis', etc.
            compensationType: null, // 'acute', 'chronic' (for respiratory)
            expectedCompensationValue: null,
            compensationAssessment: null, // 'appropriate', 'inadequate', 'excessive', 'mixed'
            additionalDisorders: [],
            anionGap: null,
            correctedAnionGap: null,
            deltaRatio: null,
            deltaRatioAssessment: null // 'pure HAGMA', 'concurrent NAGMA', 'concurrent met alk'
        };
    }

    /**
     * Validate required input values and check physiological ranges.
     */
    validateInputs(values) {
        const required = ['ph', 'paco2', 'hco3'];
        for (const key of required) {
            if (values[key] === undefined || values[key] === null || isNaN(values[key])) {
                this.results.error = `Missing or invalid required value: ${key.toUpperCase()}`;
                return false;
            }
        }

        // Basic physiological range checks (can be refined)
        if (values.ph < 6.0 || values.ph > 8.0) {
            this.results.error = `pH value (${values.ph}) is outside typical physiological range (6.8-8.0).`; return false;
        }
        if (values.paco2 < 10 || values.paco2 > 150) {
             this.results.error = `PaCO₂ value (${values.paco2}) is outside typical physiological range (10-150 mmHg).`; return false;
        }
        if (values.hco3 < 2 || values.hco3 > 60) {
             this.results.error = `HCO₃⁻ value (${values.hco3}) is outside typical physiological range (5-60 mmol/L).`; return false;
        }
        // Add checks for optional values if needed (e.g., Na+, Cl- if AG calculation is critical)

        return true;
    }

    /**
     * Step 1: Check internal consistency using Henderson-Hasselbalch.
     * Calculated [H+] = 24 * (PaCO2 / HCO3)
     */
    checkInternalConsistency(ph, paco2, hco3) {
        // Avoid division by zero if hco3 is somehow 0
        if (hco3 === 0) return "Inconsistency: HCO₃⁻ cannot be zero.";

        const calculatedH = 24 * (paco2 / hco3);
        const measuredH = Math.pow(10, -ph) * 1e9; // Convert pH to nmol/L

        // Check if calculated H+ is within ~20% of measured H+
        const difference = Math.abs(calculatedH - measuredH);
        const acceptableDifference = measuredH * 0.20; // Allow 20% variance

        if (difference > acceptableDifference && !isNaN(difference)) { // Added isNaN check
            return `Possible inconsistency detected. Measured [H⁺] ≈ ${measuredH.toFixed(1)} nmol/L, Calculated [H⁺] ≈ ${calculatedH.toFixed(1)} nmol/L.`;
        } else {
            return `Values appear internally consistent. Measured [H⁺] ≈ ${measuredH.toFixed(1)} nmol/L, Calculated [H⁺] ≈ ${calculatedH.toFixed(1)} nmol/L.`;
        }
    }

    /**
     * Step 2: Determine acidemia or alkalemia based on pH.
     */
    determineAcidemiaAlkalemia(ph) {
        if (ph < 7.35) {
            this.state.acidBaseStatus = 'acidemia';
            return `Acidemia (pH ${ph.toFixed(2)} < 7.35)`;
        } else if (ph > 7.45) {
            this.state.acidBaseStatus = 'alkalemia';
            return `Alkalemia (pH ${ph.toFixed(2)} > 7.45)`;
        } else {
            this.state.acidBaseStatus = 'normal';
            return `Normal pH (${ph.toFixed(2)})`;
        }
    }

    /**
     * Step 3: Identify the primary acid-base disorder.
     */
    identifyPrimaryDisorder(ph, paco2, hco3) {
        const status = this.state.acidBaseStatus;
        let disorder = 'Undetermined';

        if (status === 'acidemia') {
            if (paco2 > 45) {
                this.state.primaryDisorder = 'respiratory acidosis';
                disorder = `Primary Respiratory Acidosis (PaCO₂ ${paco2} mmHg is high)`;
            } else if (hco3 < 22) {
                this.state.primaryDisorder = 'metabolic acidosis';
                disorder = `Primary Metabolic Acidosis (HCO₃⁻ ${hco3} mmol/L is low)`;
            } else {
                 this.state.primaryDisorder = 'mixed acidemia';
                 disorder = `Acidemia present, but PaCO₂ (${paco2}) and HCO₃⁻ (${hco3}) do not clearly indicate a single primary disorder. Mixed disorder likely.`;
            }
        } else if (status === 'alkalemia') {
            if (paco2 < 35) {
                this.state.primaryDisorder = 'respiratory alkalosis';
                disorder = `Primary Respiratory Alkalosis (PaCO₂ ${paco2} mmHg is low)`;
            } else if (hco3 > 26) {
                this.state.primaryDisorder = 'metabolic alkalosis';
                disorder = `Primary Metabolic Alkalosis (HCO₃⁻ ${hco3} mmol/L is high)`;
            } else {
                 this.state.primaryDisorder = 'mixed alkalemia';
                 disorder = `Alkalemia present, but PaCO₂ (${paco2}) and HCO₃⁻ (${hco3}) do not clearly indicate a single primary disorder. Mixed disorder likely.`;
            }
        } else { // Normal pH
            if (paco2 > 45 && hco3 > 26) {
                 this.state.primaryDisorder = 'mixed compensated resp acid + met alk';
                 disorder = 'Normal pH with high PaCO₂ and high HCO₃⁻ suggests Mixed Disorder (Compensated Respiratory Acidosis + Metabolic Alkalosis).';
            } else if (paco2 < 35 && hco3 < 22) {
                 this.state.primaryDisorder = 'mixed compensated resp alk + met acid';
                 disorder = 'Normal pH with low PaCO₂ and low HCO₃⁻ suggests Mixed Disorder (Compensated Respiratory Alkalosis + Metabolic Acidosis).';
            } else if (paco2 >= 35 && paco2 <= 45 && hco3 >= 22 && hco3 <= 26) { // Check within normal ranges
                 this.state.primaryDisorder = 'normal';
                 disorder = 'Normal acid-base status (pH, PaCO₂, HCO₃⁻ within normal ranges).';
            } else {
                 // If pH is normal but others aren't perfectly normal, it implies full compensation
                 // The primary disorder needs to be inferred based on which direction compensation would go
                 if (paco2 > 45 || hco3 > 26) { // Suggests underlying acidosis compensated by alkalosis or vice versa
                     // This case is complex and might overlap with mixed cases above.
                     // Let's refine based on compensation check later if needed.
                     // For now, rely on the mixed checks above. If they didn't trigger, it might be borderline.
                     this.state.primaryDisorder = 'compensated'; // Mark as compensated, specific type determined later if possible
                     disorder = 'Normal pH with abnormal PaCO₂ or HCO₃⁻ suggests a fully compensated disorder or borderline values.';

                 } else if (paco2 < 35 || hco3 < 22) {
                     this.state.primaryDisorder = 'compensated';
                     disorder = 'Normal pH with abnormal PaCO₂ or HCO₃⁻ suggests a fully compensated disorder or borderline values.';
                 } else {
                     // Should not happen if previous checks are correct
                     this.state.primaryDisorder = 'normal';
                     disorder = 'Normal acid-base status.';
                 }
            }
        }
        return disorder;
    }

    /**
     * Step 4: Evaluate compensation based on the primary disorder.
     */
    evaluateCompensation(paco2, hco3) {
        const primary = this.state.primaryDisorder;
        // Skip if primary is clearly mixed, normal, or undetermined. Also skip if marked 'compensated' from step 3 as compensation is implicit.
        if (!primary || primary.includes('mixed') || primary === 'normal' || primary === 'compensated') {
            // If primary was 'compensated', the pH is normal, so compensation is 'complete' by definition.
            if (primary === 'compensated') return "Full compensation (pH is within normal range).";
            return "Compensation assessment skipped (Mixed, Normal, or Undetermined Primary).";
        }

        let expectedValue, measuredValue, valueName, resultText;
        const deltaPaco2 = paco2 - 40;
        const deltaHco3 = hco3 - 24;
        let range = 2; // Default range, will be adjusted for respiratory

        switch (primary) {
            case 'metabolic acidosis':
                this.state.expectedCompensationValue = (1.5 * hco3) + 8;
                measuredValue = paco2;
                valueName = 'PaCO₂';
                resultText = `Expected ${valueName} ≈ ${this.state.expectedCompensationValue.toFixed(1)} ± ${range} mmHg (Winter's). Measured ${valueName} = ${measuredValue.toFixed(1)} mmHg.`;
                if (Math.abs(measuredValue - this.state.expectedCompensationValue) <= range) {
                    this.state.compensationAssessment = 'appropriate';
                } else if (measuredValue < this.state.expectedCompensationValue - range) { // Lower PaCO2 than expected = more alkalosis
                    this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('respiratory alkalosis');
                } else { // Higher PaCO2 than expected = more acidosis
                    this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('respiratory acidosis');
                }
                break;

            case 'metabolic alkalosis':
                range = 5; // Wider range often used for Met Alk
                this.state.expectedCompensationValue = 40 + (0.6 * deltaHco3); // Guideline uses 0.6 multiplier
                measuredValue = paco2;
                valueName = 'PaCO₂';
                resultText = `Expected ${valueName} ≈ ${this.state.expectedCompensationValue.toFixed(1)} ± ${range} mmHg. Measured ${valueName} = ${measuredValue.toFixed(1)} mmHg.`;
                if (Math.abs(measuredValue - this.state.expectedCompensationValue) <= range) {
                    this.state.compensationAssessment = 'appropriate';
                } else if (measuredValue < this.state.expectedCompensationValue - range) { // Lower PaCO2 = more alkalosis
                    this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('respiratory alkalosis');
                } else { // Higher PaCO2 = more acidosis
                    this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('respiratory acidosis');
                }
                break;

            case 'respiratory acidosis':
                range = 3; // Guideline uses ±3 for respiratory
                const expectedAcuteHCO3 = 24 + (deltaPaco2 * 0.1);
                const expectedChronicHCO3 = 24 + (deltaPaco2 * 0.35); // Guideline uses 3.5 per 10 = 0.35
                measuredValue = hco3;
                valueName = 'HCO₃⁻';
                // Determine if closer to acute or chronic based on measured HCO3
                if (Math.abs(measuredValue - expectedAcuteHCO3) < Math.abs(measuredValue - expectedChronicHCO3)) {
                    this.state.compensationType = 'acute';
                    this.state.expectedCompensationValue = expectedAcuteHCO3;
                    resultText = `Acute Compensation: Expected ${valueName} ≈ ${expectedAcuteHCO3.toFixed(1)} ± ${range} mmol/L. Measured ${valueName} = ${measuredValue.toFixed(1)} mmol/L.`;
                } else {
                    this.state.compensationType = 'chronic';
                    this.state.expectedCompensationValue = expectedChronicHCO3;
                     resultText = `Chronic Compensation: Expected ${valueName} ≈ ${expectedChronicHCO3.toFixed(1)} ± ${range} mmol/L. Measured ${valueName} = ${measuredValue.toFixed(1)} mmol/L.`;
                }
                if (Math.abs(measuredValue - this.state.expectedCompensationValue) <= range) {
                    this.state.compensationAssessment = 'appropriate';
                } else if (measuredValue < this.state.expectedCompensationValue - range) { // Lower HCO3 = more acidosis
                    this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('metabolic acidosis');
                } else { // Higher HCO3 = more alkalosis
                    this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('metabolic alkalosis');
                }
                break;

            case 'respiratory alkalosis':
                 range = 3; // Guideline uses ±3 for respiratory
                 const expectedAcuteHCO3_alk = 24 + (deltaPaco2 * 0.2); // Guideline: Decrease = 2 * (ΔPaCO2/10) -> 0.2 multiplier
                 const expectedChronicHCO3_alk = 24 + (deltaPaco2 * 0.5); // Guideline: Decrease = 5-7 * (ΔPaCO2/10) -> Using 0.5 multiplier
                 measuredValue = hco3;
                 valueName = 'HCO₃⁻';
                 if (Math.abs(measuredValue - expectedAcuteHCO3_alk) < Math.abs(measuredValue - expectedChronicHCO3_alk)) {
                     this.state.compensationType = 'acute';
                     this.state.expectedCompensationValue = expectedAcuteHCO3_alk;
                     resultText = `Acute Compensation: Expected ${valueName} ≈ ${expectedAcuteHCO3_alk.toFixed(1)} ± ${range} mmol/L. Measured ${valueName} = ${measuredValue.toFixed(1)} mmol/L.`;
                 } else {
                     this.state.compensationType = 'chronic';
                     this.state.expectedCompensationValue = expectedChronicHCO3_alk;
                     resultText = `Chronic Compensation: Expected ${valueName} ≈ ${expectedChronicHCO3_alk.toFixed(1)} ± ${range} mmol/L. Measured ${valueName} = ${measuredValue.toFixed(1)} mmol/L.`;
                 }
                 if (Math.abs(measuredValue - this.state.expectedCompensationValue) <= range) {
                     this.state.compensationAssessment = 'appropriate';
                 } else if (measuredValue < this.state.expectedCompensationValue - range) { // Lower HCO3 = more acidosis
                     this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('metabolic acidosis');
                 } else { // Higher HCO3 = more alkalosis
                     this.state.compensationAssessment = 'mixed'; this.state.additionalDisorders.push('metabolic alkalosis');
                 }
                 break;

            default:
                return "Error: Unknown primary disorder for compensation check.";
        }

        // Append assessment to result text
        if (this.state.compensationAssessment === 'appropriate') {
            resultText += " Compensation is appropriate.";
        } else if (this.state.compensationAssessment === 'mixed') {
            // Get the last added disorder for the message
            const superimposed = this.state.additionalDisorders.length > 0 ? this.state.additionalDisorders[this.state.additionalDisorders.length - 1] : 'unknown';
            resultText += ` Suggests a superimposed ${superimposed.replace(/_/g, ' ')}.`;
        } else {
             resultText += " Compensation assessment unclear."; // Should not happen with current logic
        }

        return resultText;
    }

    /**
     * Step 5: Calculate the Anion Gap (AG).
     * AG = Na⁺ - (Cl⁻ + HCO₃⁻)
     * Corrected AG = AG + 2.5 * (4.0 - Albumin) if albumin < 4.0
     */
    calculateAnionGap(na, cl, hco3, albumin) {
        // Ensure inputs are numbers for calculation
        if (isNaN(na) || isNaN(cl) || isNaN(hco3)) {
            return "Cannot calculate Anion Gap: Invalid Na⁺, Cl⁻, or HCO₃⁻ value.";
        }

        this.state.anionGap = na - (cl + hco3);
        let resultText = `Anion Gap = ${this.state.anionGap.toFixed(1)} mmol/L`;

        // Albumin correction
        const albuminNum = parseFloat(albumin); // Ensure albumin is treated as number
        if (albumin !== undefined && !isNaN(albuminNum) && albuminNum < 4.0 && albuminNum >= 0) { // Added check for non-negative albumin
            this.state.correctedAnionGap = this.state.anionGap + 2.5 * (4.0 - albuminNum);
            resultText += ` (Normal ≈ 8-12). Albumin = ${albuminNum.toFixed(1)} g/dL. Corrected AG ≈ ${this.state.correctedAnionGap.toFixed(1)} mmol/L.`;
        } else {
            this.state.correctedAnionGap = this.state.anionGap; // Use uncorrected if albumin not provided, normal/high, or invalid
            resultText += " (Normal ≈ 8-12).";
            if (albumin !== undefined && (isNaN(albuminNum) || albuminNum < 0)) {
                resultText += " (Invalid albumin value provided for correction).";
            } else if (albumin !== undefined && albuminNum >= 4.0) {
                 resultText += " (Albumin correction not needed).";
            }
        }

        const agToCheck = this.state.correctedAnionGap; // Always use corrected AG for interpretation if calculated

        // Interpretation
        if (agToCheck > 12) {
            resultText += " Elevated Anion Gap.";
            // If primary wasn't met acid, this indicates an additional HAGMA
            // Also check if it wasn't already added via compensation check
            if (this.state.primaryDisorder !== 'metabolic acidosis' && !this.state.additionalDisorders.includes('high anion gap metabolic acidosis')) {
                 this.state.additionalDisorders.push('high anion gap metabolic acidosis');
                 resultText += " Suggests additional High AG Metabolic Acidosis.";
            }
        } else {
            resultText += " Normal Anion Gap.";
             // If primary was met acid, this confirms NAGMA (or is consistent with it)
             if (this.state.primaryDisorder === 'metabolic acidosis') {
                 // Optionally add: " Consistent with Normal AG Metabolic Acidosis (NAGMA)."
             }
        }
        return resultText;
    }

    /**
     * Step 6: Evaluate Delta Ratio (ΔAG / ΔHCO₃⁻) if HAGMA is present.
     * Delta AG = Measured AG - Normal AG (Adjusted for Albumin)
     * Delta HCO3 = 24 (Normal HCO3) - Measured HCO3
     */
    evaluateDeltaRatio(anionGap, hco3, albumin) { // Pass AG, HCO3, and Albumin
        if (isNaN(anionGap) || isNaN(hco3)) {
             return "Cannot calculate Delta Ratio: Invalid AG or HCO₃⁻ value.";
        }

        // Calculate albumin-adjusted normal AG
        let normalAG = 12;
        const albuminNum = parseFloat(albumin);
        if (albumin !== undefined && !isNaN(albuminNum) && albuminNum < 4.0 && albuminNum >= 0) {
            normalAG = 12 - (2.5 * (4.0 - albuminNum));
            // Ensure normalAG doesn't go below a reasonable minimum, e.g., 3-4
            normalAG = Math.max(3, normalAG);
        }

        const deltaAG = anionGap - normalAG; // Use adjusted normal AG
        const deltaHCO3 = 24 - hco3;

        if (deltaHCO3 === 0) {
            // Avoid division by zero. If AG is high and HCO3 is normal, suggests HAGMA + Met Alk.
             this.state.deltaRatioAssessment = 'concurrent met alk likely (delta HCO3 is zero)';
             return `Delta Ratio not calculable (ΔHCO₃⁻ is 0). High AG with normal HCO₃⁻ suggests concurrent Metabolic Alkalosis.`;
        }
        if (deltaHCO3 < 0) {
             // If HCO3 is high (deltaHCO3 negative), also suggests concurrent Met Alk.
             this.state.deltaRatioAssessment = 'concurrent met alk likely (delta HCO3 negative)';
             return `Delta Ratio interpretation complex (ΔHCO₃⁻ is negative: ${deltaHCO3.toFixed(1)}). High AG with elevated HCO₃⁻ suggests concurrent Metabolic Alkalosis.`;
        }


        this.state.deltaRatio = deltaAG / deltaHCO3;
        let resultText = `Delta Ratio (ΔAG/ΔHCO₃⁻) = ${this.state.deltaRatio.toFixed(1)}. (Normal AG adjusted to ${normalAG.toFixed(1)} if albumin provided).`;

        // Interpretation ranges based on updated guideline
        if (this.state.deltaRatio < 1.0) {
            this.state.deltaRatioAssessment = 'concurrent NAGMA';
            resultText += " Ratio < 1.0 suggests concurrent Normal Anion Gap Metabolic Acidosis (NAGMA).";
             if (!this.state.additionalDisorders.includes('normal anion gap metabolic acidosis')) {
                 this.state.additionalDisorders.push('normal anion gap metabolic acidosis');
             }
        } else if (this.state.deltaRatio > 2.0) {
            this.state.deltaRatioAssessment = 'concurrent met alk';
            resultText += " Ratio > 2.0 suggests concurrent Metabolic Alkalosis.";
             if (!this.state.additionalDisorders.includes('metabolic alkalosis')) {
                 this.state.additionalDisorders.push('metabolic alkalosis');
             }
        } else { // Ratio between 0.8 and 1.8
            this.state.deltaRatioAssessment = 'pure HAGMA';
            resultText += " Ratio ≈ 1-2 is consistent with uncomplicated High Anion Gap Metabolic Acidosis.";
        }
        return resultText;
    }

    /**
     * Generate the final interpretation string based on the analysis state.
     */
    generateFinalInterpretation() {
        const { primaryDisorder, compensationAssessment, additionalDisorders, acidBaseStatus } = this.state;

        if (this.results.error) {
            return `Analysis Error: ${this.results.error}`;
        }
        if (!primaryDisorder || primaryDisorder === 'Undetermined') {
            return "Unable to determine final interpretation.";
        }
        if (primaryDisorder === 'normal') {
            return "Normal acid-base status.";
        }

        // Start with the primary disorder
        let interpretation = `Primary ${primaryDisorder.replace(/_/g, ' ').replace('compensated', '').trim()}`; // Remove 'compensated' prefix if present

        // Add compensation status
        if (primaryDisorder === 'compensated' || acidBaseStatus === 'normal') {
             interpretation += " with complete compensation";
        } else if (compensationAssessment === 'appropriate') {
             interpretation += " with expected compensation";
        }
        // If compensationAssessment is 'mixed', the additional disorder is handled below.

        // Add distinct additional disorders, ensuring no duplicates and filtering out redundant info
        const uniqueAdditional = [...new Set(additionalDisorders)];
        const filteredAdditional = uniqueAdditional.filter(disorder => {
            // Don't add HAGMA if primary is Met Acid (it's implied by AG check)
            if (primaryDisorder === 'metabolic acidosis' && disorder === 'high anion gap metabolic acidosis') return false;
            // Don't add NAGMA if primary is Met Acid and AG was normal (it's implied)
            if (primaryDisorder === 'metabolic acidosis' && disorder === 'normal anion gap metabolic acidosis' && this.state.anionGap <= 12) return false;
            // Don't add Met Alk if primary is Met Alk (already primary)
            if (primaryDisorder === 'metabolic alkalosis' && disorder === 'metabolic alkalosis') return false;
            // Don't add Resp Acid if primary is Resp Acid
            if (primaryDisorder === 'respiratory acidosis' && disorder === 'respiratory acidosis') return false;
             // Don't add Resp Alk if primary is Resp Alk
            if (primaryDisorder === 'respiratory alkalosis' && disorder === 'respiratory alkalosis') return false;

            return true; // Keep the disorder otherwise
        });

        if (filteredAdditional.length > 0) {
             interpretation += ` and superimposed ${filteredAdditional.map(d => d.replace(/_/g, ' ')).join(' and ')}`;
        }

        return interpretation.trim() + ".";
    }
}

export default ABGAnalyzer; // Use ES module export
