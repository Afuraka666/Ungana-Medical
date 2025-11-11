

import React, { useState, useMemo } from 'react';
import { checkDrugInteractions } from '../services/geminiService';

interface ClinicalToolsModalProps {
    isOpen: boolean;
    onClose: () => void;
    T: Record<string, any>;
}

type ActiveTab = 'drug' | 'fluid' | 'scoring' | 'electrolytes';

// --- DRUG DOSE CALCULATOR ---

interface Drug {
    name: string;
    doseText: string;
    concentration?: string;
    maxDose?: string;
    notes?: string;
    adverseEvents?: string[];
    calculation?: (weight: number) => {
        dose?: number;
        unit: string;
        volume?: number;
        volumeUnit?: string;
        notes?: string;
    };
    infusionCalculation?: (weight: number) => {
        rate: string;
        preparation: string;
        notes: string;
    };
}


const drugDatabase: Drug[] = [
    // A
    {
        name: 'Adenosine',
        doseText: 'Initial: 0.1 mg/kg; Subsequent: 0.2 mg/kg',
        concentration: '3 mg/mL',
        maxDose: 'Max initial 6mg, max subsequent 12mg',
        notes: 'For SVT. Administer as a rapid IV push followed by a saline flush.',
        adverseEvents: ['Transient asystole/bradycardia', 'Flushing', 'Chest discomfort', 'Bronchospasm'],
        calculation: (weight) => {
            const initialDose = Math.min(0.1 * weight, 6);
            const subsequentDose = Math.min(0.2 * weight, 12);
            const initialVolume = initialDose / 3;
            const subsequentVolume = subsequentDose / 3;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Initial Dose (0.1mg/kg, max 6mg):\n${initialDose.toFixed(2)} mg (${initialVolume.toFixed(2)} mL)\n\nSubsequent Dose (0.2mg/kg, max 12mg):\n${subsequentDose.toFixed(2)} mg (${subsequentVolume.toFixed(2)} mL)`
            };
        }
    },
    {
        name: 'Adrenaline (Epinephrine) 1:10,000 (IV, Cardiac Arrest)',
        doseText: '10 mcg/kg (0.1 mL/kg)',
        concentration: '1 mg / 10 mL (100 mcg/mL)',
        adverseEvents: ['Tachyarrhythmias', 'Hypertension', 'Myocardial ischemia'],
        calculation: (weight) => {
            const doseMcg = 10 * weight;
            const volume = 0.1 * weight;
            return { dose: parseFloat(doseMcg.toFixed(2)), unit: 'mcg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Adrenaline (Epinephrine) 1:1000 (IM, Anaphylaxis)',
        doseText: '10 mcg/kg (0.01 mL/kg)',
        concentration: '1 mg / 1 mL (1000 mcg/mL)',
        maxDose: 'Max 0.5 mg (500 mcg)',
        adverseEvents: ['Tachycardia', 'Palpitations', 'Hypertension'],
        calculation: (weight) => {
            const doseMcg = Math.min(10 * weight, 500);
            const volume = 0.01 * weight;
            return { dose: parseFloat(doseMcg.toFixed(2)), unit: 'mcg', volume: Math.min(parseFloat(volume.toFixed(2)), 0.5), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Amiodarone (Cardiac Arrest - VF/pVT)',
        doseText: '5 mg/kg bolus',
        concentration: '50 mg/mL',
        maxDose: 'Max single dose 300mg',
        notes: 'For shock-refractory VF/pulseless VT. Can be repeated up to 2 times.',
        adverseEvents: ['Hypotension', 'Bradycardia', 'QT prolongation/Torsades de pointes'],
        calculation: (weight) => {
            const dose = Math.min(5 * weight, 300);
            const volume = dose / 50;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL'
            };
        }
    },
    {
        name: 'Amiodarone (Perfusing Tachycardia)',
        doseText: 'Loading dose: 5 mg/kg over 20-60 min',
        concentration: '50 mg/mL',
        maxDose: 'Max single dose 300mg',
        notes: 'For stable wide-complex tachycardia. Followed by an infusion.',
        adverseEvents: ['Hypotension', 'Bradycardia', 'QT prolongation/Torsades de pointes'],
        calculation: (weight) => {
            const dose = Math.min(5 * weight, 300);
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                notes: 'Dilute and infuse over 20-60 minutes. Slower infusion reduces risk of hypotension.'
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 1500; // mcg/mL
            const rateLower = (5 * weight * 60) / preparationConcentration;
            const rateUpper = (15 * weight * 60) / preparationConcentration;
            return {
                rate: '5-15 mcg/kg/min',
                preparation: 'Add 150mg (3mL) to 97mL D5W to make 1.5 mg/mL (1500 mcg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    {
        name: 'Atracurium',
        doseText: 'Intubation: 0.5 mg/kg; Infusion: 5-10 mcg/kg/min',
        concentration: '10 mg/mL',
        adverseEvents: ['Histamine release (hypotension, flushing)', 'Bronchospasm', 'Seizures (laudanosine metabolite)'],
        calculation: (weight) => {
            const dose = 0.5 * weight;
            const volume = dose / 10;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Standard intubating dose.'
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 500; // mcg/mL
            const rateLower = (5 * weight * 60) / preparationConcentration;
            const rateUpper = (10 * weight * 60) / preparationConcentration;
            return {
                rate: '5-10 mcg/kg/min',
                preparation: 'Dilute 50mg (5mL) into 95mL NS to make 0.5 mg/mL (500 mcg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    {
        name: 'Atropine',
        doseText: '0.02 mg/kg',
        concentration: '0.6 mg/mL',
        notes: 'Minimum dose 0.1mg. Maximum single dose 0.5mg (child) or 1mg (adolescent).',
        adverseEvents: ['Tachycardia', 'Dry mouth, blurred vision', 'Confusion/delirium'],
        calculation: (weight) => {
            let dose = 0.02 * weight;
            if (dose < 0.1) dose = 0.1;
            if (weight > 25) { // Simple check for adolescent
                 dose = Math.min(dose, 1.0);
            } else {
                 dose = Math.min(dose, 0.5);
            }
            const volume = dose / 0.6;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // B
    {
        name: 'Bupivacaine 0.5% Heavy (Spinal)',
        doseText: '0.3-0.5 mg/kg',
        concentration: '5 mg/mL in 8% Dextrose',
        notes: 'Hyperbaric solution for spinal anaesthesia. Dose depends on patient height, desired block level, and surgical procedure.',
        adverseEvents: ['Hypotension', 'Bradycardia', 'High spinal block (respiratory arrest)'],
        calculation: (weight) => {
            const doseLower = 0.3 * weight;
            const doseUpper = 0.5 * weight;
            const volumeLower = doseLower / 5;
            const volumeUpper = doseUpper / 5;
             return {
                dose: 0,
                unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        }
    },
    {
        name: 'Bupivacaine 0.5% Plain (Regional)',
        doseText: 'Bolus: 0.3-0.5 mg/kg; Infusion: 0.1-0.4 mg/kg/hr',
        concentration: '5 mg/mL',
        notes: 'Spinal/Epidural dose is complex. This is a guideline for educational purposes.',
        adverseEvents: ['Hypotension (neuraxial)', 'Bradycardia (neuraxial)', 'LAST (Local Anesthetic Systemic Toxicity)'],
        calculation: (weight) => {
            const doseLower = 0.3 * weight;
            const doseUpper = 0.5 * weight;
            const volumeLower = doseLower / 5;
            const volumeUpper = doseUpper / 5;
             return {
                dose: 0,
                unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const rateLower = (0.1 * weight);
            const rateUpper = (0.4 * weight);
             return {
                rate: '0.1-0.4 mg/kg/hr',
                preparation: 'Typically diluted to 0.1% or 0.25% for infusions.\nExample (0.1%): Add 10mL of 0.5% Bupivacaine to 40mL NS.',
                notes: `Calculated dose rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mg/hr.\nAdjust volume based on prepared concentration.`
            };
        }
    },
    // C
    {
        name: 'Caffeine Citrate (Loading Dose)',
        doseText: '20 mg/kg',
        concentration: '20 mg/mL',
        notes: 'Standard dose for neonatal apnea.',
        adverseEvents: ['Tachycardia', 'Jitteriness', 'Feeding intolerance'],
        calculation: (weight) => {
            const dose = 20 * weight;
            const volume = dose / 20;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // D
    {
        name: 'Dantrolene',
        doseText: 'Initial bolus: 2.5 mg/kg',
        concentration: 'Reconstituted to 0.33 mg/mL',
        notes: 'For Malignant Hyperthermia. Each 20mg vial must be reconstituted with 60mL of sterile water for injection without a bacteriostatic agent.',
        adverseEvents: ['Muscle weakness', 'Hepatotoxicity (with prolonged use)', 'Drowsiness/dizziness'],
        calculation: (weight) => {
            const dose = 2.5 * weight;
            const volume = dose / (20 / 60); // 20mg in 60mL = 0.333... mg/mL
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Repeat bolus as needed until symptoms subside. Continue infusion at 1 mg/kg/hr for at least 24 hours.'
            };
        }
    },
    {
        name: 'Dexamethasone',
        doseText: '0.15 mg/kg',
        concentration: '4 mg/mL',
        maxDose: 'Max 8mg',
        adverseEvents: ['Hyperglycemia', 'Immunosuppression', 'Fluid retention'],
        calculation: (weight) => {
            const dose = Math.min(0.15 * weight, 8);
            const volume = dose / 4;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Dexmedetomidine',
        doseText: 'Loading: 1 mcg/kg over 10 min; Infusion: 0.2-0.7 mcg/kg/hr',
        concentration: '100 mcg/mL vial (dilute before use)',
        adverseEvents: ['Bradycardia', 'Hypotension', 'Respiratory depression'],
        calculation: (weight) => { // Loading dose
            const dose = 1 * weight;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mcg',
                notes: 'To be infused over 10 minutes.'
            };
        },
        infusionCalculation: (weight) => {
            return {
                rate: '0.2-0.7 mcg/kg/hr',
                preparation: 'Dilute 2mL (200mcg) in 48mL of Normal Saline to make 4 mcg/mL.',
                notes: 'Titrate infusion to desired level of sedation (e.g., RASS score).'
            };
        }
    },
    {
        name: 'Dextrose 10% (Hypoglycemia)',
        doseText: '2 mL/kg',
        notes: 'Can also be given as 0.2 g/kg.',
        adverseEvents: ['Hyperglycemia', 'Phlebitis (if given peripherally)', 'Osmotic diuresis'],
        calculation: (weight) => {
            const volume = 2 * weight;
            return { dose: 0.2 * weight, unit: 'g', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Diclofenac',
        doseText: '1 mg/kg',
        concentration: '75 mg / 2 mL',
        maxDose: 'Max 75mg',
        adverseEvents: ['Gastric irritation/bleeding', 'Renal impairment', 'Bronchospasm (in asthmatics)'],
        calculation: (weight) => {
            const dose = Math.min(1 * weight, 75);
            const volume = (dose / 75) * 2;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // E
    {
        name: 'Ephedrine (IV Bolus)',
        doseText: '0.1-0.2 mg/kg',
        concentration: '3 mg/mL',
        notes: 'Typically for treating hypotension under anaesthesia.',
        adverseEvents: ['Tachycardia', 'Hypertension', 'Arrhythmias'],
        calculation: (weight) => {
            const doseLower = 0.1 * weight;
            const doseUpper = 0.2 * weight;
            const volumeLower = doseLower / 3;
            const volumeUpper = doseUpper / 3;
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        }
    },
    {
        name: 'Esmolol',
        doseText: 'Load: 500 mcg/kg over 1 min; Infusion: 50-300 mcg/kg/min',
        concentration: '10 mg/mL (10,000 mcg/mL)',
        adverseEvents: ['Hypotension', 'Bradycardia', 'Bronchospasm'],
        calculation: (weight) => { // Loading dose
            const dose = 500 * weight;
            const volume = dose / 10000;
            return {
                dose: parseFloat(dose.toFixed(0)),
                unit: 'mcg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Infuse over 1 minute.'
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 10000; // mcg/mL
            const rateLower = (50 * weight * 60) / preparationConcentration;
            const rateUpper = (300 * weight * 60) / preparationConcentration;
            return {
                rate: '50-300 mcg/kg/min',
                preparation: 'Use undiluted from vial (10 mg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    // F
    {
        name: 'Fentanyl',
        doseText: 'Bolus: 1-2 mcg/kg; Infusion: 1-5 mcg/kg/hr',
        concentration: '50 mcg/mL',
        adverseEvents: ['Respiratory depression', 'Bradycardia', 'Chest wall rigidity'],
        calculation: (weight) => {
            const doseLower = 1 * weight;
            const doseUpper = 2 * weight;
            const volumeLower = doseLower / 50;
            const volumeUpper = doseUpper / 50;
            return {
                dose: 0, unit: 'mcg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mcg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const rateLowerMlHr = (1 * weight) / 10;
            const rateUpperMlHr = (5 * weight) / 10;
            return {
                rate: '1-5 mcg/kg/hr',
                preparation: 'Dilute 10mL (500mcg) in 40mL Normal Saline to make 10 mcg/mL.',
                notes: `Calculated Rate: ${rateLowerMlHr.toFixed(1)} - ${rateUpperMlHr.toFixed(1)} mL/hr.\nTitrate to achieve desired analgesia/sedation.`
            };
        }
    },
    // I
    {
        name: 'Ibuprofen',
        doseText: '10 mg/kg',
        concentration: '100 mg / 5 mL',
        maxDose: 'Max 600mg per dose',
        adverseEvents: ['Gastric irritation/bleeding', 'Renal impairment', 'Bronchospasm (in asthmatics)'],
        calculation: (weight) => {
            const dose = Math.min(10 * weight, 600);
            const volume = (dose / 100) * 5;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Intralipid 20% (LAST Rescue)',
        doseText: 'Bolus: 1.5 mL/kg; Infusion: 0.25 mL/kg/min',
        concentration: '20% Lipid Emulsion',
        notes: 'For treatment of Local Anesthetic Systemic Toxicity (LAST). Follow established protocols (e.g., AAGBI, ASRA).',
        adverseEvents: ['Fat overload syndrome', 'Pancreatitis', 'Interference with lab tests (lipemia)'],
        calculation: (weight) => { // Bolus calculation
            const volume = 1.5 * weight;
            return {
                dose: 0, // Dose is described by volume
                unit: 'mL',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'Administer over 1 minute. Can be repeated once or twice if cardiovascular stability is not restored.'
            };
        },
        infusionCalculation: (weight) => {
            const rateMlMin = 0.25 * weight;
            const rateMlHr = rateMlMin * 60;
            return {
                rate: '0.25 mL/kg/min (15 mL/kg/hr)',
                preparation: 'Use undiluted from bag/bottle.',
                notes: `Calculated Infusion Rate: ${rateMlHr.toFixed(1)} mL/hr. Consider doubling the rate to 0.5 mL/kg/min if cardiovascular stability is not restored.`
            };
        }
    },
    // K
    {
        name: 'Ketamine (Analgesia)',
        doseText: 'Bolus: 0.1-0.3 mg/kg; Infusion: 0.1-0.5 mg/kg/hr',
        concentration: '10 mg/mL (Dilute for infusion)',
        notes: 'Sub-anaesthetic dose for analgesia.',
        adverseEvents: ['Emergence reactions (hallucinations)', 'Laryngospasm', 'Hypertension/Tachycardia'],
        calculation: (weight) => {
            const doseLower = 0.1 * weight;
            const doseUpper = 0.3 * weight;
            const volumeLower = doseLower / 10;
            const volumeUpper = doseUpper / 10;
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
             return {
                rate: '0.1-0.5 mg/kg/hr',
                preparation: 'Dilute 100mg (2mL of 50mg/mL vial) into 98mL Normal Saline to make 1 mg/mL.',
                notes: 'Typically used as an adjunct for severe pain. Monitor for psychomimetic side effects.'
            };
        }
    },
    {
        name: 'Ketamine (IV Induction)',
        doseText: 'Bolus: 1-2 mg/kg; Infusion: 0.5-2 mg/kg/hr',
        concentration: '10 mg/mL',
        adverseEvents: ['Emergence reactions (hallucinations)', 'Laryngospasm', 'Hypertension/Tachycardia'],
        calculation: (weight) => {
            const doseLower = 1 * weight;
            const doseUpper = 2 * weight;
            const volumeLower = doseLower / 10;
            const volumeUpper = doseUpper / 10;
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume Range: ${volumeLower.toFixed(1)}-${volumeUpper.toFixed(1)} mL`
            };
        },
        infusionCalculation: (weight) => {
             return {
                rate: '0.5-2 mg/kg/hr (sedation)',
                preparation: 'Use undiluted at 10mg/mL or dilute 500mg (10mL of 50mg/mL vial) into 40mL NS to make 10 mg/mL.',
                notes: 'Lower doses for analgesia. Higher doses for sedation. Monitor for emergence reactions.'
            };
        }
    },
    // M
    {
        name: 'Magnesium Sulphate',
        doseText: '25-50 mg/kg over 20-30 min',
        concentration: '500 mg/mL vial (must be diluted)',
        maxDose: 'Max 2g',
        notes: 'Used for severe asthma, eclampsia, and as an adjunct for analgesia.',
        adverseEvents: ['Hypotension', 'Respiratory depression', 'Loss of deep tendon reflexes'],
        calculation: (weight) => {
            const doseLower = Math.min(25 * weight, 2000);
            const doseUpper = Math.min(50 * weight, 2000);
            return {
                dose: 0, unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(0)}-${doseUpper.toFixed(0)} mg.\n\nTo Administer: Dilute the calculated dose in 50-100mL of Normal Saline and infuse over 20-30 minutes. This dose is typical for severe asthma. Analgesic doses are similar (e.g., 30-50 mg/kg) and may be followed by an infusion.\nExample prep: Add 2g (4mL of 50% solution) to 96mL NS to make 20mg/mL.`
            };
        }
    },
    {
        name: 'Midazolam',
        doseText: 'Procedural Sedation: 0.05-0.1 mg/kg; ICU Infusion: 0.02-0.1 mg/kg/hr',
        concentration: '1 mg/mL',
        adverseEvents: ['Respiratory depression', 'Hypotension', 'Paradoxical agitation/confusion'],
        calculation: (weight) => { // Procedural Sedation Bolus
            const doseLower = 0.05 * weight;
            const doseUpper = 0.1 * weight;
            // Volume is same as dose for 1mg/mL concentration
            return {
                dose: 0,
                unit: 'mg',
                notes: `Dose Range: ${doseLower.toFixed(2)}-${doseUpper.toFixed(2)} mg\nVolume Range: ${doseLower.toFixed(2)}-${doseUpper.toFixed(2)} mL\n\nTitrate slowly to effect. Reduce dose in elderly or frail patients.`
            };
        },
        infusionCalculation: (weight) => { // ICU Sedation Infusion
            const rateLowerMgHr = 0.02 * weight;
            const rateUpperMgHr = 0.1 * weight;
            return {
                rate: '0.02-0.1 mg/kg/hr',
                preparation: 'Typically prepared as 1 mg/mL (e.g., 50mg in 50mL Normal Saline).',
                notes: `Calculated Rate: ${rateLowerMgHr.toFixed(2)} - ${rateUpperMgHr.toFixed(2)} mg/hr.\nTitrate to target sedation score (e.g., RASS). Accumulates in adipose tissue and with renal impairment.`
            };
        }
    },
    {
        name: 'Morphine',
        doseText: 'Bolus: 0.1 mg/kg; Infusion: 10-30 mcg/kg/hr',
        concentration: '10 mg/mL (Dilute for infusion)',
        maxDose: 'Max 10mg per bolus dose',
        adverseEvents: ['Respiratory depression', 'Hypotension', 'Nausea/Vomiting'],
        calculation: (weight) => {
            const dose = Math.min(0.1 * weight, 10);
            const volume = dose / 10;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        },
        infusionCalculation: (weight) => {
            const rateLowerMlHr = (10 * weight) / 1000;
            const rateUpperMlHr = (30 * weight) / 1000;
            return {
                rate: '10-30 mcg/kg/hr',
                preparation: 'Add 50mg Morphine to 50mL Normal Saline to make 1 mg/mL (1000 mcg/mL).',
                notes: `Calculated Rate: ${rateLowerMlHr.toFixed(2)} - ${rateUpperMlHr.toFixed(2)} mL/hr.\nMonitor for respiratory depression.`
            };
        }
    },
    // N
    {
        name: 'Naloxone (Opioid Reversal)',
        doseText: '0.1 mg/kg',
        concentration: '0.4 mg/mL',
        maxDose: 'Max 2mg per dose',
        notes: 'For severe opioid overdose. For reversal of respiratory depression while preserving analgesia, use much smaller titrated doses (e.g., 1-2 mcg/kg).',
        adverseEvents: ['Acute opioid withdrawal', 'Hypertension', 'Tachycardia', 'Pulmonary edema'],
        calculation: (weight) => {
            const dose = Math.min(0.1 * weight, 2);
            const volume = dose / 0.4;
            return {
                dose: parseFloat(dose.toFixed(2)),
                unit: 'mg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL'
            };
        }
    },
    {
        name: 'Neostigmine',
        doseText: '0.05 mg/kg',
        concentration: '2.5 mg/mL',
        maxDose: 'Max 5mg',
        notes: 'Reversal agent. MUST be given with an anticholinergic (e.g., Atropine 0.02 mg/kg or Glycopyrrolate 0.01 mg/kg).',
        adverseEvents: ['Bradycardia', 'Increased salivation/secretions', 'Bronchospasm'],
        calculation: (weight) => {
            const dose = Math.min(0.05 * weight, 5);
            const volume = dose / 2.5;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Norepinephrine (Infusion)',
        doseText: '0.05-1 mcg/kg/min',
        adverseEvents: ['Peripheral ischemia/necrosis (extravasation)', 'Hypertension', 'Arrhythmias'],
        infusionCalculation: (weight) => {
             return {
                rate: '0.05 - 1 mcg/kg/min',
                preparation: 'Add 4mg (1 ampoule) to 46mL of Dextrose 5% to make 80 mcg/mL.',
                notes: 'Titrate to target Mean Arterial Pressure (MAP). Use a central line if possible.'
            };
        }
    },
    // O
    {
        name: 'Ondansetron',
        doseText: '0.1 mg/kg',
        concentration: '2 mg/mL',
        maxDose: 'Max 4mg',
        adverseEvents: ['QT prolongation', 'Headache', 'Constipation'],
        calculation: (weight) => {
            const dose = Math.min(0.1 * weight, 4);
            const volume = dose / 2;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    // P
    {
        name: 'Pancuronium',
        doseText: '0.1 mg/kg',
        concentration: '2 mg/mL',
        notes: 'Long-acting non-depolarizing muscle relaxant.',
        adverseEvents: ['Tachycardia', 'Hypertension', 'Prolonged paralysis'],
        calculation: (weight) => {
            const dose = 0.1 * weight;
            const volume = dose / 2;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Paracetamol (Acetaminophen)',
        doseText: '15 mg/kg',
        concentration: '120 mg / 5 mL',
        maxDose: 'Max 1g per dose',
        adverseEvents: ['Hepatotoxicity (in overdose)', 'Rash', 'Allergic reactions'],
        calculation: (weight) => {
            const dose = Math.min(15 * weight, 1000);
            const volume = (dose / 120) * 5;
            return { dose: parseFloat(dose.toFixed(2)), unit: 'mg', volume: parseFloat(volume.toFixed(2)), volumeUnit: 'mL' };
        }
    },
    {
        name: 'Propofol',
        doseText: 'Induction: 2-3 mg/kg; Infusion: 50-200 mcg/kg/min',
        concentration: '10 mg/mL',
        adverseEvents: ['Hypotension', 'Apnea/Respiratory depression', 'Propofol Infusion Syndrome (PRIS)'],
        calculation: (weight) => {
            const doseLower = 2 * weight;
            const doseUpper = 3 * weight;
            const volumeLower = doseLower / 10;
            const volumeUpper = doseUpper / 10;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Induction Dose: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume: ${volumeLower.toFixed(1)}-${volumeUpper.toFixed(1)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const concentrationMcgMl = 10 * 1000; // 10mg/mL = 10,000 mcg/mL
            const rateLower = (50 * weight * 60) / concentrationMcgMl;
            const rateUpper = (200 * weight * 60) / concentrationMcgMl;
            return {
                rate: '50-200 mcg/kg/min',
                preparation: 'Use undiluted from vial (10 mg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.\nTitrate to depth of anaesthesia/sedation.`
            };
        }
    },
    // R
    {
        name: 'Rocuronium',
        doseText: 'Intubation: 0.6-1.2 mg/kg; Infusion: 5-15 mcg/kg/min',
        concentration: '10 mg/mL',
        adverseEvents: ['Anaphylaxis', 'Tachycardia', 'Residual paralysis'],
        calculation: (weight) => {
            const standardDose = 0.6 * weight;
            const rsiDose = 1.2 * weight;
            const standardVolume = standardDose / 10;
            const rsiVolume = rsiDose / 10;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Standard Intubation (0.6 mg/kg):\nDose: ${standardDose.toFixed(1)} mg, Volume: ${standardVolume.toFixed(2)} mL\n\nRSI (1.2 mg/kg):\nDose: ${rsiDose.toFixed(1)} mg, Volume: ${rsiVolume.toFixed(2)} mL`
            };
        },
        infusionCalculation: (weight) => {
            const preparationConcentration = 1000; // mcg/mL
            const rateLower = (5 * weight * 60) / preparationConcentration;
            const rateUpper = (15 * weight * 60) / preparationConcentration;
            return {
                rate: '5-15 mcg/kg/min',
                preparation: 'Dilute 50mg (5mL) into 45mL NS to make 1 mg/mL (1000 mcg/mL).',
                notes: `Calculated Infusion Rate: ${rateLower.toFixed(1)} - ${rateUpper.toFixed(1)} mL/hr.`
            };
        }
    },
    // S
    {
        name: 'Sildenafil (IV)',
        doseText: 'Load: 10 mcg/kg over 3 min; Infusion: 10 mcg/kg/hr',
        concentration: '0.8 mg/mL (800 mcg/mL)',
        notes: 'For treatment of pulmonary hypertension.',
        adverseEvents: ['Hypotension', 'Flushing', 'Visual disturbances'],
        calculation: (weight) => { // Loading dose
            const dose = 10 * weight;
            const volume = dose / 800;
            return {
                dose: parseFloat(dose.toFixed(1)),
                unit: 'mcg',
                volume: parseFloat(volume.toFixed(2)),
                volumeUnit: 'mL',
                notes: 'To be infused over 3 minutes.'
            };
        },
        infusionCalculation: (weight) => {
            const doseHr = 10 * weight; // mcg/hr
            const rateMlHr = doseHr / 800; // (mcg/hr) / (mcg/mL)
            return {
                rate: '10 mcg/kg/hr',
                preparation: 'Use standard vial concentration (0.8 mg/mL).',
                notes: `Calculated Infusion Rate: ${rateMlHr.toFixed(2)} mL/hr.`
            };
        }
    },
    {
        name: 'Sugammadex',
        doseText: '2-16 mg/kg depending on block depth',
        concentration: '100 mg/mL',
        notes: 'Reversal agent for Rocuronium/Vecuronium.',
        adverseEvents: ['Anaphylaxis / Hypersensitivity', 'Bradycardia', 'Coagulopathy (transient)'],
        calculation: (weight) => {
            const moderateDose = 2 * weight;
            const deepDose = 4 * weight;
            const immediateDose = 16 * weight;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Moderate Block (TOF count ≥2):\nDose: ${moderateDose.toFixed(0)} mg, Volume: ${(moderateDose/100).toFixed(2)} mL\n\nDeep Block (PTC 1-2):\nDose: ${deepDose.toFixed(0)} mg, Volume: ${(deepDose/100).toFixed(2)} mL\n\nImmediate Reversal (after 1.2mg/kg Roc):\nDose: ${immediateDose.toFixed(0)} mg, Volume: ${(immediateDose/100).toFixed(2)} mL`
            };
        }
    },
    {
        name: 'Suxamethonium',
        doseText: '1-2 mg/kg',
        concentration: '50 mg/mL',
        adverseEvents: ['Hyperkalemia (in burns/neuromuscular disease)', 'Malignant hyperthermia', 'Bradycardia'],
        calculation: (weight) => {
            const doseLower = 1 * weight;
            const doseUpper = 2 * weight;
            const volumeLower = doseLower / 50;
            const volumeUpper = doseUpper / 50;
            return {
                dose: 0,
                unit: 'mg',
                notes: `Dose: ${doseLower.toFixed(1)}-${doseUpper.toFixed(1)} mg\nVolume: ${volumeLower.toFixed(2)}-${volumeUpper.toFixed(2)} mL`
            };
        }
    }
].sort((a, b) => a.name.localeCompare(b.name)); // Sort alphabetically

const DrugDoseCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [weight, setWeight] = useState<number | ''>('');
    const [selectedDrug, setSelectedDrug] = useState<Drug | null>(null);
    const [selectedInteractionDrugs, setSelectedInteractionDrugs] = useState<string[]>([]);
    const [interactionResult, setInteractionResult] = useState<string | null>(null);
    const [isCheckingInteractions, setIsCheckingInteractions] = useState<boolean>(false);
    const [interactionError, setInteractionError] = useState<string | null>(null);

    const bolusResult = useMemo(() => {
        if (weight && selectedDrug && selectedDrug.calculation) {
            return selectedDrug.calculation(weight);
        }
        return null;
    }, [weight, selectedDrug]);

    const infusionResult = useMemo(() => {
        if (weight && selectedDrug && selectedDrug.infusionCalculation) {
            return selectedDrug.infusionCalculation(weight);
        }
        return null;
    }, [weight, selectedDrug]);
    
    const handleDrugSelection = (drugName: string) => {
        setSelectedInteractionDrugs(prev => 
            prev.includes(drugName) 
                ? prev.filter(d => d !== drugName)
                : [...prev, drugName]
        );
    };

    const handleCheckInteractions = async () => {
        if (selectedInteractionDrugs.length < 2) return;
        setIsCheckingInteractions(true);
        setInteractionResult(null);
        setInteractionError(null);
        try {
            const result = await checkDrugInteractions(selectedInteractionDrugs, 'en'); // Assuming 'en' for now, can be dynamic
            setInteractionResult(result);
        } catch (error) {
            console.error("Interaction check failed:", error);
            setInteractionError(T.interactionError);
        } finally {
            setIsCheckingInteractions(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Dose Calculator */}
            <div className="space-y-4">
                <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label htmlFor="weight-input" className="block text-sm font-medium text-gray-700">{T.weightKgLabel}</label>
                            <input type="number" id="weight-input" value={weight} onChange={(e) => setWeight(e.target.value ? parseFloat(e.target.value) : '')} min="0" step="0.1" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black bg-white" />
                        </div>
                        <div>
                            <label htmlFor="drug-select" className="block text-sm font-medium text-gray-700">{T.selectDrugLabel}</label>
                            <select id="drug-select" onChange={(e) => setSelectedDrug(drugDatabase.find(d => d.name === e.target.value) || null)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black bg-white">
                                <option value="">-- Select --</option>
                                {drugDatabase.map(d => <option key={d.name} value={d.name}>{d.name}</option>)}
                            </select>
                        </div>
                    </div>
                </div>

                {selectedDrug && (bolusResult || infusionResult) && (
                    <div className="mt-4 p-4 bg-white border border-slate-300 rounded-lg animate-fade-in space-y-4">
                        <h3 className="text-md font-bold text-brand-blue">{selectedDrug.name}</h3>
                        <p className="text-xs text-gray-500 italic">Based on {selectedDrug.doseText} {selectedDrug.maxDose ? `(${selectedDrug.maxDose})` : ''}</p>
                        
                        {selectedDrug.adverseEvents && (
                            <div className="bg-red-100 border-l-4 border-red-500 text-red-900 p-3 mt-2 rounded-r-lg" role="alert">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <h4 className="text-sm font-bold">Key Adverse Events to Monitor</h4>
                                        <ul className="mt-1 list-disc list-inside text-xs">
                                            {selectedDrug.adverseEvents.map((event, index) => <li key={index}>{event}</li>)}
                                        </ul>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {selectedDrug.notes && <p className="text-xs text-gray-600 mt-2">{selectedDrug.notes}</p>}
                        
                        {bolusResult && (
                             <div className="p-3 bg-blue-100 border border-blue-200 rounded-lg mt-4">
                                <h4 className="text-sm font-semibold text-blue-900">Bolus / Single Dose</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                    {bolusResult.dose !== undefined && bolusResult.dose > 0 ? (
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">{T.calculatedDoseLabel}</p>
                                            <p className="text-xl font-bold text-slate-900">{bolusResult.dose} {bolusResult.unit}</p>
                                        </div>
                                    ) : null}
                                    {bolusResult.volume !== undefined && (
                                        <div>
                                            <p className="text-sm font-medium text-gray-600">{T.calculatedVolumeLabel} {selectedDrug.concentration && `(${selectedDrug.concentration})`}</p>
                                            <p className="text-xl font-bold text-slate-900">{bolusResult.volume} {bolusResult.volumeUnit}</p>
                                        </div>
                                    )}
                                </div>
                                {bolusResult.notes && (
                                    <div className="mt-3">
                                        <p className="text-sm font-medium text-gray-600">{T.drugNotesLabel}</p>
                                        <p className="text-md font-semibold text-slate-900 whitespace-pre-wrap">{bolusResult.notes}</p>
                                    </div>
                                )}
                            </div>
                        )}

                         {infusionResult && (
                             <div className="p-3 bg-indigo-100 border border-indigo-200 rounded-lg mt-4">
                                <h4 className="text-sm font-semibold text-indigo-900">Infusion</h4>
                                 <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                                    <div>
                                        <p className="text-sm font-medium text-gray-600">Rate</p>
                                        <p className="text-xl font-bold text-slate-900">{infusionResult.rate}</p>
                                    </div>
                                     <div>
                                        <p className="text-sm font-medium text-gray-600">Preparation</p>
                                        <p className="text-md font-semibold text-slate-900">{infusionResult.preparation}</p>
                                    </div>
                                </div>
                                 <div className="mt-3">
                                    <p className="text-sm font-medium text-gray-600">{T.drugNotesLabel}</p>
                                    <p className="text-md font-semibold text-slate-900 whitespace-pre-wrap">{infusionResult.notes}</p>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            <hr className="my-6 border-gray-200" />

            {/* Interaction Checker */}
            <div className="space-y-4">
                <h3 className="text-md font-bold text-brand-blue">{T.drugInteractionCheckerTitle}</h3>
                <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                    <label className="block text-sm font-medium text-gray-700 mb-2">{T.selectDrugsPrompt}</label>
                    <div className="max-h-32 overflow-y-auto border border-gray-300 rounded-md p-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2 bg-white">
                        {drugDatabase.map(drug => (
                            <label key={drug.name} className="flex items-center space-x-2 text-sm cursor-pointer text-gray-800">
                                <input
                                    type="checkbox"
                                    checked={selectedInteractionDrugs.includes(drug.name)}
                                    onChange={() => handleDrugSelection(drug.name)}
                                    className="h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue-light"
                                />
                                <span>{drug.name}</span>
                            </label>
                        ))}
                    </div>
                </div>
                <button
                    onClick={handleCheckInteractions}
                    disabled={selectedInteractionDrugs.length < 2 || isCheckingInteractions}
                    className="w-full flex items-center justify-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {isCheckingInteractions ? (
                        <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                        </svg>
                    )}
                    <span>{isCheckingInteractions ? T.checkingInteractionsMessage : T.checkInteractionsButton}</span>
                </button>

                {(isCheckingInteractions || interactionResult || interactionError) && (
                    <div className="mt-4 p-4 bg-slate-100 border border-slate-200 rounded-lg animate-fade-in">
                        <h4 className="text-md font-bold text-gray-800">{T.interactionResultsTitle}</h4>
                        {isCheckingInteractions && <p className="text-sm text-gray-500">{T.checkingInteractionsMessage}</p>}
                        {interactionError && <p className="text-sm text-red-600">{interactionError}</p>}
                        {interactionResult && (
                            <div className="mt-2 text-sm text-gray-700 whitespace-pre-wrap prose prose-sm max-w-none">
                                {interactionResult.includes('###') ? (
                                    <div dangerouslySetInnerHTML={{__html: interactionResult.replace(/### (.*)/g, '<h3 class="text-base font-semibold text-brand-blue mt-3">$1</h3>').replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold text-gray-800">$1</strong>')}} />
                                ) : (
                                    <p>{interactionResult}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};


// --- FLUID MANAGEMENT CALCULATOR ---

const FluidManagementCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [weight, setWeight] = useState<number | ''>('');

    const { maintenance, bolus, breakdown } = useMemo(() => {
        if (!weight || weight <= 0) return { maintenance: null, bolus: null, breakdown: [] };
        
        // Holliday-Segar for maintenance
        let dailyFluid = 0;
        const breakdownSteps = [];
        if (weight <= 10) {
            dailyFluid = weight * 100;
            breakdownSteps.push(`First 10kg: ${weight.toFixed(1)}kg x 100 mL/kg = ${dailyFluid.toFixed(0)} mL`);
        } else if (weight <= 20) {
            const firstPart = 10 * 100;
            const secondPart = (weight - 10) * 50;
            dailyFluid = firstPart + secondPart;
            breakdownSteps.push(`First 10kg: 10kg x 100 mL/kg = ${firstPart} mL`);
            breakdownSteps.push(`Next 10kg: ${(weight - 10).toFixed(1)}kg x 50 mL/kg = ${secondPart.toFixed(0)} mL`);
        } else {
            const firstPart = 10 * 100;
            const secondPart = 10 * 50;
            const thirdPart = (weight - 20) * 20;
            dailyFluid = firstPart + secondPart + thirdPart;
            breakdownSteps.push(`First 10kg: 10kg x 100 mL/kg = ${firstPart} mL`);
            breakdownSteps.push(`Next 10kg: 10kg x 50 mL/kg = ${secondPart} mL`);
            breakdownSteps.push(`Remaining: ${(weight - 20).toFixed(1)}kg x 20 mL/kg = ${thirdPart.toFixed(0)} mL`);
        }

        const maintenanceResult = {
            daily: dailyFluid.toFixed(0),
            hourly: (dailyFluid / 24).toFixed(1),
        };
        
        // Bolus calculation
        const bolusResult = (weight * 20).toFixed(0);

        return { maintenance: maintenanceResult, bolus: bolusResult, breakdown: breakdownSteps };
    }, [weight]);

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-md font-bold text-brand-blue mb-2">{T.maintenanceFluidTitle}</h3>
                <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                    <label htmlFor="fluid-weight-input" className="block text-sm font-medium text-gray-700">{T.weightKgLabel}</label>
                    <input type="number" id="fluid-weight-input" value={weight} onChange={(e) => setWeight(e.target.value ? parseFloat(e.target.value) : '')} min="0" step="0.1" className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black bg-white" />
                </div>
                 {maintenance && (
                     <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg animate-fade-in">
                        <h4 className="font-semibold text-green-900">{T.fluidResultsTitle}</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-2">
                             <div>
                                <p className="text-sm font-medium text-gray-600">{T.dailyRequirementLabel}</p>
                                <p className="text-xl font-bold text-slate-900">{maintenance.daily} mL/day</p>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-gray-600">{T.hourlyRateLabel}</p>
                                <p className="text-xl font-bold text-slate-900">{maintenance.hourly} mL/hr</p>
                            </div>
                        </div>
                        <div className="mt-3 text-xs text-gray-500">
                             <p className="font-semibold">{T.fluidBreakdownTitle}:</p>
                             <ul className="list-disc list-inside">
                                {breakdown.map((step, i) => <li key={i}>{step}</li>)}
                             </ul>
                             <p className="mt-1 italic">{T.hollidaySegarMethod}</p>
                         </div>
                     </div>
                 )}
            </div>
            <div>
                 <h3 className="text-md font-bold text-brand-blue mb-2">{T.bolusFluidTitle}</h3>
                 {bolus && (
                    <div className="p-4 bg-amber-100 border border-amber-300 rounded-lg">
                        <p className="text-sm font-medium text-gray-600">{T.bolusVolumeLabel}</p>
                        <p className="text-xl font-bold text-slate-900">{bolus} mL</p>
                    </div>
                 )}
            </div>
        </div>
    );
};

// --- SCORING SYSTEMS ---

const GcsCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [scores, setScores] = useState({ eye: 4, verbal: 5, motor: 6 });

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const { name, value } = e.target;
        setScores(prev => ({ ...prev, [name]: parseInt(value) }));
    };

    const totalScore = scores.eye + scores.verbal + scores.motor;
    let interpretation = '';
    if (totalScore <= 8) interpretation = T.gcsSevere;
    else if (totalScore <= 12) interpretation = T.gcsModerate;
    else interpretation = T.gcsMild;

    const options = {
        eye: [
            { value: 4, text: T.gcsEye4 }, { value: 3, text: T.gcsEye3 },
            { value: 2, text: T.gcsEye2 }, { value: 1, text: T.gcsEye1 }
        ],
        verbal: [
            { value: 5, text: T.gcsVerbal5 }, { value: 4, text: T.gcsVerbal4 },
            { value: 3, text: T.gcsVerbal3 }, { value: 2, text: T.gcsVerbal2 },
            { value: 1, text: T.gcsVerbal1 }
        ],
        motor: [
            { value: 6, text: T.gcsMotor6 }, { value: 5, text: T.gcsMotor5 },
            { value: 4, text: T.gcsMotor4 }, { value: 3, text: T.gcsMotor3 },
            { value: 2, text: T.gcsMotor2 }, { value: 1, text: T.gcsMotor1 }
        ]
    };

    return (
        <div>
            <h3 className="text-md font-bold text-brand-blue mb-2">{T.gcsTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{T.gcsSubtitle}</p>
            <div className="p-4 bg-slate-100 rounded-lg border border-slate-200 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700">{T.gcsEyeResponse}</label>
                    <select name="eye" value={scores.eye} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white">
                        {options.eye.map(opt => <option key={opt.value} value={opt.value}>{opt.value} - {opt.text}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700">{T.gcsVerbalResponse}</label>
                    <select name="verbal" value={scores.verbal} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white">
                        {options.verbal.map(opt => <option key={opt.value} value={opt.value}>{opt.value} - {opt.text}</option>)}
                    </select>
                </div>
                 <div>
                    <label className="block text-sm font-medium text-gray-700">{T.gcsMotorResponse}</label>
                    <select name="motor" value={scores.motor} onChange={handleChange} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white">
                        {options.motor.map(opt => <option key={opt.value} value={opt.value}>{opt.value} - {opt.text}</option>)}
                    </select>
                </div>
            </div>
             <div className="mt-4 p-4 bg-blue-100 border border-blue-300 rounded-lg">
                <h4 className="font-semibold text-blue-900">{T.gcsResultTitle}</h4>
                <p className="text-2xl font-bold text-slate-900">{totalScore} / 15</p>
                <p className="text-md font-semibold text-slate-800 mt-1">{interpretation}</p>
            </div>
        </div>
    );
};

const PonvCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [riskFactors, setRiskFactors] = useState({ female: false, nonSmoker: false, history: false, opioids: false });

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setRiskFactors(prev => ({ ...prev, [name]: checked }));
    };

    const score = Object.values(riskFactors).filter(Boolean).length;
    const riskPercentage = [10, 21, 39, 61, 79][score];

    const factors = [
        { key: 'female', text: T.ponvFemale },
        { key: 'nonSmoker', text: T.ponvNonSmoker },
        { key: 'history', text: T.ponvHistory },
        { key: 'opioids', text: T.ponvOpioids },
    ];

    return (
        <div>
            <h3 className="text-md font-bold text-brand-blue mb-2">{T.ponvTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{T.ponvSubtitle}</p>
            <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                <div className="space-y-3">
                    {factors.map(({ key, text }) => (
                        <label
                            key={key}
                            className={`flex items-center p-3 rounded-md border transition cursor-pointer ${
                                riskFactors[key as keyof typeof riskFactors]
                                    ? 'bg-blue-100 border-brand-blue shadow-sm'
                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="checkbox"
                                name={key}
                                checked={riskFactors[key as keyof typeof riskFactors]}
                                onChange={handleCheckboxChange}
                                className="h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue-light"
                            />
                            <span className="ml-3 text-sm font-medium text-black">{text}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div className="mt-4 p-4 bg-blue-100 border border-blue-300 rounded-lg">
                <h4 className="font-semibold text-blue-900">{T.ponvResultTitle}</h4>
                <p className="text-lg font-bold text-slate-900">{score} {T.ponvRiskFactors(score)}</p>
                <p className="text-md font-semibold text-slate-800 mt-1">{T.ponvRiskPercentage(riskPercentage)}</p>
            </div>
        </div>
    );
};

const StopBangCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [answers, setAnswers] = useState<Record<string, boolean>>({ snoring: false, tired: false, observed: false, pressure: false, bmi: false, age: false, neck: false, gender: false });
    
    const score = Object.values(answers).filter(Boolean).length;
    const { risk, recommendation } = useMemo(() => {
        const isHighRiskByCriteria = answers.bmi && answers.neck && answers.gender;
        if (score >= 5 || (score >= 2 && isHighRiskByCriteria)) {
            return { risk: T.stopBangHighRisk, recommendation: T.stopBangHighRiskRec };
        }
        if (score >= 3) {
            return { risk: T.stopBangIntermediateRisk, recommendation: T.stopBangIntermediateRiskRec };
        }
        return { risk: T.stopBangLowRisk, recommendation: T.stopBangLowRiskRec };
    }, [answers, score, T]);

    const handleCheckboxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, checked } = e.target;
        setAnswers(prev => ({ ...prev, [name]: checked }));
    };

    const riskColorClass = risk === T.stopBangHighRisk ? 'bg-red-100 border-red-300' : risk === T.stopBangIntermediateRisk ? 'bg-amber-100 border-amber-300' : 'bg-green-100 border-green-300';
    const riskTextColorClass = risk === T.stopBangHighRisk ? 'text-red-900' : risk === T.stopBangIntermediateRisk ? 'text-amber-900' : 'text-green-900';

    const questions = [
        { key: 'snoring', text: T.stopBangSnoring }, { key: 'tired', text: T.stopBangTired },
        { key: 'observed', text: T.stopBangObserved }, { key: 'pressure', text: T.stopBangPressure },
        { key: 'bmi', text: T.stopBangBmi }, { key: 'age', text: T.stopBangAge },
        { key: 'neck', text: T.stopBangNeck }, { key: 'gender', text: T.stopBangGender },
    ];

    return (
        <div>
            <h3 className="text-md font-bold text-brand-blue mb-2">{T.stopBangTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{T.stopBangSubtitle}</p>
            <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                     {questions.map(({ key, text }) => (
                        <label
                            key={key}
                            className={`flex items-center p-3 rounded-md border transition cursor-pointer ${
                                answers[key]
                                    ? 'bg-blue-100 border-brand-blue shadow-sm'
                                    : 'bg-white border-gray-200 hover:bg-gray-50'
                            }`}
                        >
                            <input
                                type="checkbox"
                                name={key}
                                checked={answers[key]}
                                onChange={handleCheckboxChange}
                                className="h-4 w-4 rounded border-gray-300 text-brand-blue focus:ring-brand-blue-light"
                            />
                            <span className="ml-3 text-sm font-medium text-black">{text}</span>
                        </label>
                    ))}
                </div>
            </div>
            <div className={`mt-4 p-4 rounded-lg ${riskColorClass}`}>
                <h4 className={`font-semibold ${riskTextColorClass}`}>{T.stopBangResultTitle}</h4>
                <p className="text-lg font-bold text-slate-900">{T.stopBangScore}: {score}</p>
                <p className={`text-md font-semibold ${riskTextColorClass} mt-1`}>{T.stopBangRiskLevel}: {risk}</p>
                <p className="text-xs text-slate-700 mt-2">{recommendation}</p>
            </div>
        </div>
    );
};

const ScoringSystems: React.FC<{ T: Record<string, any> }> = ({ T }) => (
    <div className="space-y-8">
        <GcsCalculator T={T} />
        <hr className="my-6 border-gray-200" />
        <StopBangCalculator T={T} />
        <hr className="my-6 border-gray-200" />
        <PonvCalculator T={T} />
    </div>
);

// --- ELECTROLYTE CALCULATORS ---

const AnionGapCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [sodium, setSodium] = useState<number | ''>('');
    const [chloride, setChloride] = useState<number | ''>('');
    const [bicarb, setBicarb] = useState<number | ''>('');

    const result = useMemo(() => {
        if (sodium === '' || chloride === '' || bicarb === '') return null;
        const gap = sodium - (chloride + bicarb);
        let interpretation = '';
        if (gap > 12) interpretation = T.anionGapHigh;
        else if (gap < 8) interpretation = T.anionGapLow;
        else interpretation = T.anionGapNormal;
        return { value: gap.toFixed(0), interpretation };
    }, [sodium, chloride, bicarb, T]);

    return (
        <div>
            <h3 className="text-md font-bold text-brand-blue mb-2">{T.anionGapTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{T.anionGapSubtitle}</p>
            <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.sodiumLabel}</label>
                        <input type="number" value={sodium} onChange={e => setSodium(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.chlorideLabel}</label>
                        <input type="number" value={chloride} onChange={e => setChloride(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.bicarbonateLabel}</label>
                        <input type="number" value={bicarb} onChange={e => setBicarb(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white" />
                    </div>
                </div>
            </div>
            {result && (
                <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
                    <p className="text-sm font-medium text-gray-600">{T.anionGapResult}</p>
                    <p className="text-xl font-bold text-slate-900">{result.value} mEq/L</p>
                    <p className="text-xs text-gray-600 mt-1">{result.interpretation}</p>
                </div>
            )}
        </div>
    );
};

const CorrectedSodiumCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [measuredNa, setMeasuredNa] = useState<number | ''>('');
    const [glucose, setGlucose] = useState<number | ''>('');
    const [glucoseUnit, setGlucoseUnit] = useState<'mg/dL' | 'mmol/L'>('mg/dL');

    const result = useMemo(() => {
        if (measuredNa === '' || glucose === '') return null;
        
        const glucoseInMgDl = glucoseUnit === 'mg/dL' ? glucose : glucose * 18;
        
        if (glucoseInMgDl <= 100) {
            return { value: measuredNa.toFixed(1), note: "No correction needed (glucose is normal)." };
        }

        const correctionFactor = 2.4;
        const correctedValue = measuredNa + correctionFactor * ((glucoseInMgDl - 100) / 100);
        return { value: correctedValue.toFixed(1), note: null };
    }, [measuredNa, glucose, glucoseUnit]);

    return (
        <div>
            <h3 className="text-md font-bold text-brand-blue mb-2">{T.correctedSodiumTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{T.correctedSodiumSubtitle}</p>
             <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.measuredSodiumLabel}</label>
                        <input type="number" value={measuredNa} onChange={(e) => setMeasuredNa(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} className="mt-1 block w-full p-2 border border-gray-300 rounded-md shadow-sm text-black bg-white" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">{T.glucoseLabel}</label>
                        <div className="flex">
                            <input type="number" value={glucose} onChange={(e) => setGlucose(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} className="mt-1 block w-full p-2 border border-gray-300 rounded-l-md shadow-sm text-black bg-white" />
                            <select value={glucoseUnit} onChange={(e) => setGlucoseUnit(e.target.value as 'mg/dL' | 'mmol/L')} className="mt-1 block p-2 border-t border-r border-b border-gray-300 rounded-r-md bg-gray-100 text-black text-sm">
                                <option>mg/dL</option>
                                <option>mmol/L</option>
                            </select>
                        </div>
                    </div>
                </div>
            </div>
            {result && (
                <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
                    <p className="text-sm font-medium text-gray-600">{T.correctedSodiumResult}</p>
                    <p className="text-xl font-bold text-slate-900">{result.value} mEq/L</p>
                    {result.note && <p className="text-xs text-gray-500 mt-1">{result.note}</p>}
                </div>
            )}
        </div>
    );
};

const FreeWaterDeficitCalculator: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const [weight, setWeight] = useState<number | ''>('');
    const [currentNa, setCurrentNa] = useState<number | ''>('');
    const [patientType, setPatientType] = useState('male');

    const result = useMemo(() => {
        if (weight === '' || weight <= 0 || currentNa === '') return null;
        
        if (currentNa <= 145) {
            return { deficit: '0.00', halfDeficit: '0.00', maxRate: '0.0', isNormal: true };
        }

        const tbwFactor = patientType === 'male' ? 0.6 : patientType === 'female' ? 0.5 : 0.6;
        const deficit = ((currentNa / 140) - 1) * (tbwFactor * weight);
        const halfDeficit = (deficit / 2).toFixed(2);
        const maxRate = (0.5 * weight).toFixed(1);
        return { deficit: deficit.toFixed(2), halfDeficit, maxRate, isNormal: false };
    }, [weight, currentNa, patientType]);

    return (
        <div>
            <h3 className="text-md font-bold text-brand-blue mb-2">{T.freeWaterDeficitTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{T.freeWaterDeficitSubtitle}</p>
            <div className="p-4 bg-slate-100 rounded-lg border border-slate-200">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><label className="block text-sm font-medium text-gray-700">{T.weightKgLabel}</label><input type="number" value={weight} onChange={e => setWeight(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white" /></div>
                    <div><label className="block text-sm font-medium text-gray-700">{T.currentSodiumLabel}</label><input type="number" value={currentNa} onChange={e => setCurrentNa(e.target.valueAsNumber || (e.target.value === '0' ? 0 : ''))} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white" /></div>
                    <div><label className="block text-sm font-medium text-gray-700">{T.patientTypeLabel}</label><select value={patientType} onChange={e => setPatientType(e.target.value)} className="mt-1 block w-full p-2 border border-gray-300 rounded-md text-black bg-white"><option value="male">{T.patientTypeMale}</option><option value="female">{T.patientTypeFemale}</option><option value="child">{T.patientTypeChild}</option></select></div>
                </div>
            </div>
            {result && (
                 <div className="mt-4 p-4 bg-green-100 border border-green-300 rounded-lg">
                    <p className="text-sm font-medium text-gray-600">{T.freeWaterDeficitResult}</p>
                    <p className="text-xl font-bold text-slate-900">{result.deficit} L</p>
                    {!result.isNormal && (
                        <div className="mt-3 text-xs text-gray-600 space-y-1">
                            <p className="font-semibold">{T.correctionGuidance}</p>
                            <p>• {T.correctionGuidance1(result.halfDeficit)}</p>
                            <p>• {T.correctionGuidance2}</p>
                            <p>• {T.correctionGuidance3(result.maxRate)}</p>
                        </div>
                    )}
                 </div>
            )}
        </div>
    );
};

const PotassiumReplacementGuide: React.FC<{ T: Record<string, any> }> = ({ T }) => {
    const guidelines = [
        { level: '> 3.5 mEq/L', oral: T.potassiumOral1, iv: T.potassiumIV1 },
        { level: '3.0 - 3.4 mEq/L', oral: T.potassiumOral2, iv: T.potassiumIV2 },
        { level: '2.5 - 2.9 mEq/L', oral: T.potassiumOral3, iv: T.potassiumIV3 },
        { level: '< 2.5 mEq/L', oral: T.potassiumOral4, iv: T.potassiumIV4 },
    ];
    return (
        <div>
            <h3 className="text-md font-bold text-brand-blue mb-2">{T.potassiumReplacementTitle}</h3>
            <p className="text-xs text-gray-500 mb-4">{T.potassiumReplacementSubtitle}</p>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="w-full text-sm text-left text-gray-500">
                    <thead className="text-xs text-slate-800 uppercase bg-slate-200 font-semibold"><tr><th scope="col" className="px-4 py-2">{T.potassiumLevel}</th><th scope="col" className="px-4 py-2">{T.potassiumOral}</th><th scope="col" className="px-4 py-2">{T.potassiumIV}</th></tr></thead>
                    <tbody>
                        {guidelines.map((g, i) => <tr key={g.level} className={`border-b border-slate-200 ${i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}`}><th scope="row" className="px-4 py-2 font-medium text-slate-900 whitespace-nowrap">{g.level}</th><td className="px-4 py-2">{g.oral}</td><td className="px-4 py-2">{g.iv}</td></tr>)}
                    </tbody>
                </table>
            </div>
            <div className="mt-4 bg-red-100 border-l-4 border-red-500 text-red-900 p-3 rounded-r-lg">
                <h4 className="text-sm font-bold">{T.importantSafetyNotes}</h4>
                <ul className="mt-1 list-disc list-inside text-xs">
                    <li>{T.safetyNote1}</li><li>{T.safetyNote2}</li><li>{T.safetyNote3}</li>
                </ul>
            </div>
        </div>
    );
};

const ElectrolyteCalculators: React.FC<{ T: Record<string, any> }> = ({ T }) => (
    <div className="space-y-8">
        <AnionGapCalculator T={T} />
        <hr className="my-6 border-gray-200" />
        <FreeWaterDeficitCalculator T={T} />
        <hr className="my-6 border-gray-200" />
        <CorrectedSodiumCalculator T={T} />
        <hr className="my-6 border-gray-200" />
        <PotassiumReplacementGuide T={T} />
    </div>
);


// --- MAIN MODAL COMPONENT ---

export const ClinicalToolsModal: React.FC<ClinicalToolsModalProps> = ({ isOpen, onClose, T }) => {
    const [activeTab, setActiveTab] = useState<ActiveTab>('drug');

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4 animate-fade-in" aria-modal="true" role="dialog">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                <header className="p-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-bold text-gray-800">{T.clinicalToolsTitle}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition" aria-label="Close">
                        <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </header>
                
                 <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-4 px-4 overflow-x-auto" aria-label="Tabs">
                        <button onClick={() => setActiveTab('drug')} className={`${activeTab === 'drug' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                           {T.drugDoseTab}
                        </button>
                        <button onClick={() => setActiveTab('fluid')} className={`${activeTab === 'fluid' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                           {T.fluidManagementTab}
                        </button>
                         <button onClick={() => setActiveTab('scoring')} className={`${activeTab === 'scoring' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                           {T.scoringSystemsTab}
                        </button>
                        <button onClick={() => setActiveTab('electrolytes')} className={`${activeTab === 'electrolytes' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'} whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm`}>
                           {T.electrolytesTab}
                        </button>
                    </nav>
                </div>

                <main className="p-6 overflow-y-auto flex-grow bg-slate-50">
                    <div className="bg-amber-50 border border-amber-300 text-amber-900 p-3 text-xs mb-6 rounded-lg flex items-start space-x-3">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.21 3.03-1.742 3.03H4.42c-1.532 0-2.492-1.696-1.742-3.03l5.58-9.92zM10 13a1 1 0 110-2 1 1 0 010 2zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                        <div>
                            <strong className="font-semibold">Disclaimer:</strong> {T.calculatorDisclaimer}
                        </div>
                    </div>
                    {activeTab === 'drug' && <DrugDoseCalculator T={T} />}
                    {activeTab === 'fluid' && <FluidManagementCalculator T={T} />}
                    {activeTab === 'scoring' && <ScoringSystems T={T} />}
                    {activeTab === 'electrolytes' && <ElectrolyteCalculators T={T} />}
                </main>
                 <footer className="p-3 border-t border-gray-200 text-right bg-gray-50">
                    <button onClick={onClose} className="bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300">
                        {T.closeButton}
                    </button>
                </footer>
            </div>
        </div>
    );
};