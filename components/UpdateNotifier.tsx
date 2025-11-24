import React, { useState, useEffect, useCallback } from 'react';

export const UpdateNotifier: React.FC = () => {
    const [isUpdateAvailable, setIsUpdateAvailable] = useState(false);
    const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);

    const handleUpdate = useCallback((registration: ServiceWorkerRegistration) => {
        if (registration.waiting) {
            setWaitingWorker(registration.waiting);
            setIsUpdateAvailable(true);
        }
    }, []);
    
    useEffect(() => {
        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then(registration => {
                // An update is already waiting
                if (registration.waiting) {
                    handleUpdate(registration);
                }

                // A new worker is found
                registration.onupdatefound = () => {
                    const newWorker = registration.installing;
                    if (newWorker) {
                        newWorker.onstatechange = () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // New worker is installed and waiting
                                handleUpdate(registration);
                            }
                        };
                    }
                };
            });
            
            // Reload the page when the new service worker takes control
            let refreshing = false;
            navigator.serviceWorker.oncontrollerchange = () => {
                if (!refreshing) {
                    window.location.reload();
                    refreshing = true;
                }
            };
        }
    }, [handleUpdate]);


    const handleRefresh = () => {
        if (waitingWorker) {
            waitingWorker.postMessage({ type: 'SKIP_WAITING' });
            setIsUpdateAvailable(false);
        }
    };

    const handleDismiss = () => {
        setIsUpdateAvailable(false);
    };

    if (!isUpdateAvailable) {
        return null;
    }

    return (
        <div 
            role="alert"
            aria-live="assertive"
            className="fixed bottom-4 left-4 right-4 sm:left-auto sm:w-full sm:max-w-sm p-4 bg-white rounded-lg shadow-xl border border-gray-200 animate-fade-in z-50"
        >
            <div className="flex items-start">
                <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-brand-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                </div>
                <div className="ml-3 w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">
                        New Updates Available!
                    </p>
                    <p className="mt-1 text-sm text-gray-600">
                        Ungana Medical has been enhanced. Refresh to get the latest features.
                    </p>
                    <div className="mt-3 flex space-x-3">
                        <button
                            onClick={handleRefresh}
                            className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-brand-blue hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue-light transition"
                        >
                            Refresh Now
                        </button>
                        <button
                            onClick={handleDismiss}
                            className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue-light transition"
                        >
                            Later
                        </button>
                    </div>
                </div>
                <div className="ml-4 flex-shrink-0 flex">
                    <button onClick={handleDismiss} className="inline-flex text-gray-400 hover:text-gray-500">
                        <span className="sr-only">Close</span>
                         <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};