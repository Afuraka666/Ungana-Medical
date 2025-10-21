import React, { useState } from 'react';

interface ControlPanelProps {
  onGenerate: (condition: string, discipline: string) => void;
  disabled: boolean;
  T: Record<string, any>;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({ onGenerate, disabled, T }) => {
  const [conditionInput, setConditionInput] = useState("Type 2 Diabetes Mellitus");
  const [disciplineInput, setDisciplineInput] = useState("Medicine");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (conditionInput.trim() && disciplineInput.trim() && !disabled) {
      onGenerate(conditionInput.trim(), disciplineInput.trim());
    }
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <div className="flex flex-col col-span-1 sm:col-span-1 lg:col-span-2">
            <label htmlFor="condition-input" className="font-semibold text-gray-700 text-sm mb-1">
              {T.conditionLabel}
            </label>
            <input
              type="text"
              id="condition-input"
              value={conditionInput}
              onChange={(e) => setConditionInput(e.target.value)}
              disabled={disabled}
              placeholder={T.conditionPlaceholder}
              className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition w-full bg-gray-50"
            />
        </div>
        
        <div className="flex flex-col col-span-1 sm:col-span-1 lg:col-span-2">
            <label htmlFor="discipline-input" className="font-semibold text-gray-700 text-sm mb-1">
              {T.disciplineLabel}
            </label>
            <input
              type="text"
              id="discipline-input"
              value={disciplineInput}
              onChange={(e) => setDisciplineInput(e.target.value)}
              disabled={disabled}
              placeholder={T.disciplinePlaceholder}
              className="p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-brand-blue-light focus:border-brand-blue-light transition w-full bg-gray-50"
            />
        </div>

        <div className="col-span-1 sm:col-span-2 lg:col-span-1">
            <button
              type="submit"
              disabled={disabled || !conditionInput.trim() || !disciplineInput.trim()}
              className="w-full bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-6 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center space-x-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M12 6V3m0 18v-3"></path></svg>
              <span>{T.generateButton}</span>
            </button>
        </div>
      </form>
    </div>
  );
};