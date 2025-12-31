
import React from 'react';

interface WelcomeScreenProps {
  T: Record<string, any>;
  onOpenSavedWork: () => void;
  onOpenClinicalTools: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ T, onOpenSavedWork, onOpenClinicalTools }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-white rounded-lg shadow-lg border border-gray-200 p-8 text-center overflow-y-auto">
      <div className="max-w-2xl mx-auto">
        <div className="relative mb-6">
            <div className="absolute inset-0 bg-brand-blue/5 rounded-full blur-3xl transform -translate-y-4"></div>
            <svg className="relative mx-auto h-20 w-20 text-brand-blue" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418" />
            </svg>
        </div>
        
        <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">{T.welcomeTitle}</h2>
        <p className="mt-4 text-lg text-gray-600 leading-relaxed">
          {T.welcomeMessage}
        </p>

        <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button 
                onClick={onOpenSavedWork}
                className="group flex flex-col items-center p-6 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-white hover:border-brand-blue hover:shadow-xl transition-all duration-300"
            >
                <div className="w-12 h-12 bg-blue-100 text-brand-blue rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                    </svg>
                </div>
                <h3 className="font-bold text-gray-800">{T.savedWorkButton}</h3>
                <p className="text-sm text-gray-500 mt-1">{T.viewSavedWorkButton}</p>
            </button>

            <button 
                onClick={onOpenClinicalTools}
                className="group flex flex-col items-center p-6 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-white hover:border-indigo-600 hover:shadow-xl transition-all duration-300"
            >
                <div className="w-12 h-12 bg-indigo-100 text-indigo-600 rounded-xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.532 1.532 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.532 1.532 0 01-.947-2.287c1.561-.379-1.561-2.6 0-2.978a1.532 1.532 0 01.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
                    </svg>
                </div>
                <h3 className="font-bold text-gray-800">{T.clinicalToolsButton}</h3>
                <p className="text-sm text-gray-500 mt-1">{T.clinicalToolsTitle}</p>
            </button>
        </div>
      </div>
    </div>
  );
};
