import React, { useState } from 'react';
import type { QuizQuestion } from '../types';

interface QuizViewProps {
  quiz: QuizQuestion[];
  T: Record<string, any>;
  showTitle?: boolean;
}

export const QuizView: React.FC<QuizViewProps> = ({ quiz, T, showTitle = true }) => {
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [isSubmitted, setIsSubmitted] = useState(false);

  const handleAnswerChange = (questionIndex: number, answerIndex: number) => {
    setUserAnswers(prev => ({ ...prev, [questionIndex]: answerIndex }));
  };

  const handleSubmit = () => {
    setIsSubmitted(true);
  };
  
  const handleReset = () => {
      setUserAnswers({});
      setIsSubmitted(false);
  }

  const score = quiz.reduce((acc, question, index) => {
    return acc + (userAnswers[index] === question.correctAnswerIndex ? 1 : 0);
  }, 0);

  return (
    <div className="mt-1 relative pb-24">
      {showTitle && <h3 className="text-lg font-bold text-brand-blue border-b-2 border-brand-blue/30 pb-1 mb-3">{T.quizTitle}</h3>}
      {isSubmitted && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 text-center">
            <h4 className="font-bold text-xl text-brand-blue">{T.quizComplete}</h4>
            <p className="text-lg text-gray-700 mt-1">{T.quizScore(score, quiz.length)}</p>
            <button onClick={handleReset} className="mt-3 bg-brand-blue hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-md transition text-sm">
                {T.quizTryAgain}
            </button>
        </div>
      )}
      <div className="space-y-6">
        {quiz.map((q, qIndex) => (
          <div key={qIndex} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <p className="font-semibold text-gray-800">{qIndex + 1}. {q.question}</p>
            <div className="mt-3 space-y-2">
              {q.options.map((option, oIndex) => {
                const isCorrect = oIndex === q.correctAnswerIndex;
                const isSelected = userAnswers[qIndex] === oIndex;
                
                let optionClasses = "w-full text-left p-3 border rounded-md transition text-sm flex items-center";
                if (!isSubmitted) {
                  optionClasses += isSelected ? " bg-blue-100 border-brand-blue" : " bg-white border-gray-300 hover:bg-gray-100";
                } else {
                    if (isCorrect) {
                        optionClasses += " bg-green-100 border-green-400 text-green-800 font-semibold";
                    } else if (isSelected && !isCorrect) {
                        optionClasses += " bg-red-100 border-red-400 text-red-800";
                    } else {
                        optionClasses += " bg-white border-gray-300 opacity-70";
                    }
                }

                return (
                  <button key={oIndex} onClick={() => handleAnswerChange(qIndex, oIndex)} disabled={isSubmitted} className={optionClasses}>
                    <span className="font-mono mr-3">{String.fromCharCode(65 + oIndex)}.</span> {option}
                  </button>
                );
              })}
            </div>
            {isSubmitted && (
                <div className="mt-3 p-3 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-800 text-sm">
                    <p><span className="font-bold">{T.quizExplanation}:</span> {q.explanation}</p>
                </div>
            )}
          </div>
        ))}
      </div>
      {!isSubmitted && (
        <div className="sticky bottom-0 -mx-4 sm:-mx-6 mt-6 py-4 bg-white/90 backdrop-blur-sm border-t border-gray-200 text-center z-10">
          <button 
            onClick={handleSubmit} 
            disabled={Object.keys(userAnswers).length !== quiz.length}
            className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-6 rounded-md transition duration-300 ease-in-out disabled:bg-gray-400 disabled:cursor-not-allowed shadow-lg"
          >
            {T.quizSubmit}
          </button>
        </div>
      )}
    </div>
  );
};